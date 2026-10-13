"""Bounded, single-process ephemeral run registry. It never shares private state."""

import asyncio
import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from app.policies import severity
from app.sandbox.contracts import SimulationStart, MODE, FIXTURES_VERSION
from app.sandbox.engine import evidence_for, report_for
from app.sandbox.effects import SyntheticTickets
from app.version import APP_VERSION

TERMINAL = {"SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"}


def stamp():
    return datetime.now(timezone.utc).isoformat()


class SandboxError(Exception):
    def __init__(self, code, message, status=400, retryable=False):
        self.code, self.message, self.status, self.retryable = code, message, status, retryable
        super().__init__(message)


@dataclass
class Run:
    owner: str
    request: SimulationStart
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "ACCEPTED"
    created_at: str = field(default_factory=stamp)
    created: float = field(default_factory=time.monotonic)
    completed_at: str | None = None
    events: list[dict[str, Any]] = field(default_factory=list)
    result: dict[str, Any] | None = None
    task: asyncio.Task | None = None
    evidence: list[dict[str, Any]] = field(default_factory=list)
    errors: list[dict[str, Any]] = field(default_factory=list)
    stage: str = "received"

    def event(self, step, status, overview, technical=None, duration=None):
        if len(self.events) >= 40:
            raise RuntimeError("Event budget exceeded")
        self.stage = step
        self.events.append(
            {
                "schema_version": "1.0",
                "run_id": self.id,
                "project_id": "resolveai",
                "event_id": f"{self.id}:{len(self.events) + 1}",
                "sequence": len(self.events) + 1,
                "occurred_at": stamp(),
                "step_id": step,
                "step_type": step,
                "component": "resolveai.sandbox",
                "status": status,
                "mode": MODE,
                "title": step.replace("_", " ").capitalize(),
                "overview": overview,
                "technical": technical or {},
                "duration_ms": duration,
                "trace_id": self.id,
                "usage": {
                    "kind": "NONE",
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "cost": 0,
                    "currency": "USD",
                },
            }
        )

    def summary(self):
        return {
            "schema_version": "1.0",
            "project_id": "resolveai",
            "run_id": self.id,
            "mode": MODE,
            "status": self.status,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
            "event_count": len(self.events),
            "result_ref": f"/api/projects/resolveai/simulations/{self.id}/result",
            "app_version": APP_VERSION,
            "fixtures_version": FIXTURES_VERSION,
            "connector_kind": "synthetic",
        }

    def finish(self, status, output=None):
        self.status, self.completed_at = status, stamp()
        self.result = {
            "schema_version": "1.0",
            "project_id": "resolveai",
            "run_id": self.id,
            "mode": MODE,
            "status": status,
            "app_version": APP_VERSION,
            "fixtures_version": FIXTURES_VERSION,
            "output": output
            or {
                "summary": "Run ended without a report.",
                "safety": {"actions_executed": [], "connector_kind": "synthetic"},
                "provenance": {"kind": "synthetic", "connector_kind": "synthetic"},
                "limitations": ["Run ended before a validated report was available."],
            },
            "evidence": self.evidence,
            "errors": self.errors,
            "duration_ms": round((time.monotonic() - self.created) * 1000, 3),
            "cost": {"kind": "NONE", "value": 0, "currency": "USD"},
        }


class RunStore:
    def __init__(self, ttl=600, max_runs=256, max_active=8, per_owner=2, checkpoint_seconds=0.06, deadline=4):
        self.runs: dict[str, Run] = {}
        self.ttl, self.max_runs, self.max_active, self.per_owner = ttl, max_runs, max_active, per_owner
        self.checkpoint_seconds, self.deadline = checkpoint_seconds, deadline
        self.streams: dict[str, int] = {}

    def cleanup(self):
        for key, run in list(self.runs.items()):
            age = time.monotonic() - run.created
            if age > self.ttl and run.status != "EXPIRED":
                if run.task and not run.task.done():
                    run.task.cancel()
                run.evidence = []
                run.events = []
                run.errors = [
                    {
                        "code": "RUN_EXPIRED",
                        "message": "Temporary run expired; submit a new run.",
                        "retryable": False,
                    }
                ]
                run.finish("EXPIRED")
            if age > self.ttl + 120:
                del self.runs[key]

    def get(self, run_id, owner):
        self.cleanup()
        run = self.runs.get(run_id)
        if not run or run.owner != owner:
            raise SandboxError("RUN_NOT_FOUND", "Run unavailable for this session.", 404)
        return run

    def start(self, request: SimulationStart, owner):
        self.cleanup()
        if request.client_correlation_id:
            previous = next(
                (
                    r
                    for r in self.runs.values()
                    if r.owner == owner and r.request.client_correlation_id == request.client_correlation_id
                ),
                None,
            )
            if previous:
                if previous.request.model_dump() != request.model_dump():
                    raise SandboxError(
                        "IDEMPOTENCY_CONFLICT",
                        "This request key already identifies different input. Use a new key.",
                        409,
                    )
                if previous.status == "EXPIRED":
                    raise SandboxError("RUN_EXPIRED", "Use a new request key after expiry.", 410)
                return previous, True
        active = [r for r in self.runs.values() if r.status not in TERMINAL]
        if (
            len(active) >= self.max_active
            or sum(r.owner == owner for r in active) >= self.per_owner
            or len(self.runs) >= self.max_runs
        ):
            raise SandboxError(
                "CAPACITY_LIMIT",
                "Simulation capacity reached. Retry after existing runs finish or expire.",
                429,
                True,
            )
        run = Run(owner, request)
        self.runs[run.id] = run
        run.task = asyncio.create_task(self.execute(run))
        return run, False

    async def stage(self, run, step, explanation, action):
        if run.status in TERMINAL:
            raise asyncio.CancelledError
        start = time.perf_counter()
        run.event(step, "STARTED", explanation)
        # Cooperative checkpoints provide cancellation and let streams flush; this is not model thinking time.
        await asyncio.sleep(self.checkpoint_seconds)
        details = action()
        run.event(step, "SUCCEEDED", explanation, details, round((time.perf_counter() - start) * 1000, 3))

    async def execute(self, run):
        run.status = "RUNNING"
        v = run.request.input
        try:
            async with asyncio.timeout(self.deadline):
                await self.stage(
                    run,
                    "received",
                    "The server accepted your synthetic incident.",
                    lambda: {
                        "input": v.model_dump(),
                        "connector_kind": "synthetic",
                        "source": "server execution",
                    },
                )
                await self.stage(
                    run,
                    "validated",
                    "Types, ranges and allowed fixture values passed validation.",
                    lambda: {
                        "schema_version": "1.0",
                        "arbitrary_urls_sql_credentials": "forbidden",
                        "input_sha256": hashlib.sha256(
                            json.dumps(v.model_dump(), sort_keys=True).encode()
                        ).hexdigest(),
                    },
                )
                await self.stage(
                    run,
                    "deduplicated",
                    "The session-scoped request key identifies one run.",
                    lambda: {
                        "request_key": run.request.client_correlation_id,
                        "scope": "anonymous session",
                        "side_effects": "none",
                    },
                )
                await self.stage(
                    run,
                    "severity",
                    "The error rate determines incident severity.",
                    lambda: {
                        "input": {"error_rate": v.error_rate},
                        "output": {"severity": severity(v.error_rate)},
                        "thresholds": {"CRITICAL": 50, "HIGH": 10, "MEDIUM": 1},
                    },
                )
                run.evidence = evidence_for(v, v.fault == "connector_timeout")
                if v.fault == "workflow_timeout":
                    run.event(
                        "metrics",
                        "WAITING",
                        "A controlled stall exercises the run deadline.",
                        {"fault": v.fault, "simulated": True},
                    )
                    await asyncio.sleep(self.deadline + 0.1)
                if v.fault == "connector_timeout":
                    run.errors.append(
                        {
                            "code": "CONNECTOR_TIMEOUT",
                            "message": "Synthetic PostgreSQL adapter unavailable; continue with partial evidence.",
                            "retryable": True,
                        }
                    )
                    run.event(
                        "metrics",
                        "FAILED",
                        "The simulated database adapter timed out. Other evidence remains usable.",
                        {"error": run.errors[-1], "attempt": 1, "outbound_requests": 0},
                    )
                await self.stage(
                    run,
                    "metrics",
                    "Synthetic adapters derive diagnostics from the edited metrics.",
                    lambda: {
                        "evidence": [e for e in run.evidence if e["id"] in ("E1", "E2", "E3", "E4", "E5")],
                        "partial": v.fault == "connector_timeout",
                    },
                )
                await self.stage(
                    run,
                    "logs",
                    "Only the selected safe log fixture is read; instruction attempts are quarantined.",
                    lambda: {
                        "evidence": [e for e in run.evidence if e["id"] == "E6"],
                        "instructions_executed": False,
                    },
                )
                if v.fault in ("provider_429", "invalid_model_output"):
                    error = {
                        "code": "PROVIDER_RATE_LIMIT"
                        if v.fault == "provider_429"
                        else "MODEL_OUTPUT_INVALID",
                        "message": "Simulated provider failure; deterministic workflow fallback selected.",
                        "retryable": v.fault == "provider_429",
                    }
                    run.errors.append(error)
                    run.event(
                        "tools",
                        "BLOCKED",
                        "A mock model failure demonstrates a safe fallback.",
                        {
                            "error": error,
                            "adapter_kind": "simulated",
                            "model_fallback": "not attempted: no eligible configured provider",
                            "workflow_fallback": "deterministic rules",
                            "retry_after_seconds": v.retry_after_seconds
                            if v.fault == "provider_429"
                            else None,
                            "actual_provider_calls": 0,
                        },
                    )
                tickets = SyntheticTickets()
                ticket = tickets.create(run.id, "review-preview")
                assert ticket == tickets.create(run.id, "review-preview")
                await self.stage(
                    run,
                    "tools",
                    "Diagnostics stay within the synthetic capability boundary.",
                    lambda: {
                        "allowed": ["postgres.connection_lock_fixture", "redis.memory_fixture"],
                        "executed_business_actions": [],
                        "approval": "human review required",
                        "simulated_ticket_idempotency": {
                            "artifact": ticket,
                            "attempts": 2,
                            "records_created": len(tickets.records),
                            "external_actions": 0,
                        },
                    },
                )
                output = report_for(v, run.evidence)
                await self.stage(
                    run,
                    "correlation",
                    "Rules compare evidence, competing signals and irrelevant decoys.",
                    lambda: {
                        "decisions": output["decisions"],
                        "excluded_evidence": output["excluded_evidence"],
                        "rules_version": output["versions"]["rules"],
                    },
                )
                await self.stage(
                    run,
                    "report",
                    "The final report includes evidence, uncertainty and human next steps.",
                    lambda: {"output": output, "evidence_ids": [e["id"] for e in run.evidence]},
                )
                run.finish("SUCCEEDED", output)
        except asyncio.CancelledError:
            if run.status != "EXPIRED":
                run.errors.append(
                    {
                        "code": "RUN_CANCELLED",
                        "message": "Cancelled by visitor or server shutdown.",
                        "retryable": False,
                    }
                )
                run.event(
                    run.stage,
                    "BLOCKED",
                    "Execution was cancelled. No remediation was performed.",
                    {"error": run.errors[-1]},
                )
                run.finish("CANCELLED")
        except TimeoutError:
            run.errors.append(
                {
                    "code": "RUN_TIMEOUT",
                    "message": "Execution deadline exceeded. Adjust input and retry.",
                    "retryable": True,
                }
            )
            run.event(
                run.stage, "FAILED", "The run stopped at its bounded deadline.", {"error": run.errors[-1]}
            )
            run.finish("FAILED")
        except Exception:
            run.errors.append(
                {
                    "code": "INTERNAL_ERROR",
                    "message": "Run stopped safely; no action was executed.",
                    "retryable": False,
                }
            )
            run.event(
                run.stage, "FAILED", "An unexpected error stopped this run safely.", {"error": run.errors[-1]}
            )
            run.finish("FAILED")

    async def close(self):
        tasks = [r.task for r in self.runs.values() if r.task and not r.task.done()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
