"""Explicit adapter from ResolveAI domain objects to pinned Ecosystem Contracts v1."""

import hashlib
import json
import os
import re
from datetime import datetime, timedelta
from app.sandbox.contracts import FIXTURES_VERSION, RULES_VERSION, WORKFLOW_VERSION, MODE
from app.version import APP_VERSION


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def provenance():
    revision = os.getenv("BUILD_SHA", "")
    return {
        "data_origin": "SYNTHETIC",
        "connector_kind": "MOCK",
        "app_version": APP_VERSION,
        "fixtures_version": FIXTURES_VERSION,
        "rules_version": RULES_VERSION,
        "workflow_version": WORKFLOW_VERSION,
        "model_version": "none",
        "prompt_version": "none",
        "source_revision": revision if re.fullmatch(r"[a-f0-9]{40}", revision) else "0" * 40,
    }


def usage(identifier):
    return {
        "usage_id": identifier,
        "kind": "NONE",
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_tokens": 0,
        "provider_calls": 0,
        "cost": {"kind": "NONE", "value": 0, "currency": "USD", "pricing_version": "no-provider-calls"},
    }


def error(code, message, status, correlation, retryable=False):
    if code == "INVALID_CURSOR":
        status = 409
    elif status not in (401, 403, 404, 409, 410, 413, 422, 429, 503):
        status = 422 if status == 415 else 503
    codes = {
        401: "UNAUTHENTICATED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        410: "RUN_EXPIRED",
        413: "PAYLOAD_TOO_LARGE",
        422: "VALIDATION_ERROR",
        429: "RATE_LIMITED",
        503: "SERVICE_UNAVAILABLE",
    }
    return {
        "schema_version": "1.0",
        "code": code if code in ("INVALID_CURSOR", "AI_UNAVAILABLE", "POLICY_BLOCKED") else codes[status],
        "message": message[:240],
        "retryable": retryable,
        "correlation_id": correlation,
        "http_status": status,
        "retry_after_seconds": 60 if status == 429 else 0,
    }


def evidence(items):
    return [
        {
            "evidence_id": e["id"],
            "origin": "FIXTURE",
            "reference": "output.evidence_ledger/" + e["id"],
            "sha256": digest(e),
        }
        for e in items
    ]


def state(run, ttl, duplicate=False):
    summary = run.summary()
    return {
        k: summary[k]
        for k in (
            "schema_version",
            "project_id",
            "run_id",
            "mode",
            "status",
            "created_at",
            "completed_at",
            "event_count",
        )
    } | {
        "created_at": summary["created_at"].replace("+00:00", "Z"),
        "completed_at": summary["completed_at"].replace("+00:00", "Z") if summary["completed_at"] else None,
        "expires_at": (datetime.fromisoformat(run.created_at) + timedelta(seconds=ttl))
        .isoformat()
        .replace("+00:00", "Z"),
        "last_sequence": len(run.events),
        "result_ref": summary["result_ref"] if run.result else None,
        "provenance": provenance(),
        "extensions": {"x_deduplicated": duplicate},
    }


def event(value):
    types = {
        "received": "VALIDATION",
        "validated": "VALIDATION",
        "deduplicated": "POLICY",
        "severity": "POLICY",
        "metrics": "RETRIEVAL",
        "logs": "RETRIEVAL",
        "tools": "EXECUTION",
        "correlation": "SUMMARY",
        "report": "SUMMARY",
    }
    details = value["technical"]
    result = {
        **value,
        "occurred_at": value["occurred_at"].replace("+00:00", "Z"),
        "step_type": types.get(value["step_id"], "EXECUTION"),
        "usage": usage(value["event_id"]),
        "provenance": provenance(),
        "technical": {
            "action": value["step_id"],
            "input_schema_version": "resolveai-input-1.0",
            "output_schema_version": "resolveai-output-1.0",
            "input_ref": "run-input",
            "output_ref": "step-" + str(value["sequence"]),
            "decisions": [value["overview"][:240]],
            "evidence": evidence(details.get("evidence", [])),
            "adapter_kind": "DETERMINISTIC",
            "attempt": details.get("attempt", 1),
            "fallback_reason": details.get("error", {}).get("message"),
        },
    }
    if details.get("error"):
        result["error"] = error(
            details["error"]["code"],
            details["error"]["message"],
            503,
            value["run_id"],
            details["error"].get("retryable", False),
        )
    return result


def result(run):
    current = run.result
    return {
        **current,
        "output": {
            **current["output"],
            "evidence_ledger": current["evidence"],
            "faults": current["errors"],
            "step_details": [
                {
                    "reference": "step-" + str(e["sequence"]),
                    "step_id": e["step_id"],
                    "sequence": e["sequence"],
                    "status": e["status"],
                    "duration_ms": e["duration_ms"],
                    "technical": e["technical"],
                }
                for e in run.events
            ],
        },
        "evidence": evidence(current["evidence"]),
        "provenance": provenance(),
        "output_schema_version": "resolveai-output-1.0",
        "safety_status": "REVIEW_REQUIRED",
        "warnings": [e["message"][:240] for e in current["errors"]],
        "limitations": current["output"].get("limitations", ["Synthetic evidence requires human review."]),
        # Canonical errors describe terminal failure, while recovered diagnostic
        # faults remain visible in warnings, output.faults and step_details.
        "errors": []
        if current["status"] == "SUCCEEDED"
        else [error(e["code"], e["message"], 503, run.id, e["retryable"]) for e in current["errors"]],
        "usage": usage(run.id),
        "cost": usage(run.id)["cost"],
    }


def preset(item):
    return {
        "schema_version": "1.0",
        "project_id": "resolveai",
        "preset_id": item["id"],
        "title": item["title"],
        "description": item["description"],
        "mode": MODE,
        "seed": item["input"]["seed"],
        "input": item["input"],
        "fixtures_version": FIXTURES_VERSION,
    }


def install_openapi(app, prefix):
    """Publish the exact pinned wire schemas alongside the narrower project request."""
    from pathlib import Path
    from fastapi.openapi.utils import get_openapi

    def spec():
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
        root = Path(__file__).resolve().parents[2] / "contracts/ecosystem-v1"

        def local(value):
            if isinstance(value, list):
                return [local(v) for v in value]
            if isinstance(value, dict):
                result = {k: local(v) for k, v in value.items() if k not in ("$id", "$schema")}
                ref = result.get("$ref", "")
                if ref.startswith("https://contracts.example.invalid/v1/"):
                    resource, _, fragment = ref.split("/v1/", 1)[1].partition("#")
                    result["$ref"] = (
                        "#/components/schemas/Protocol_" + resource.removesuffix(".schema.json") + fragment
                    )
                return result
            return value

        for schema_path in root.glob("*.schema.json"):
            schema["components"]["schemas"]["Protocol_" + schema_path.name.removesuffix(".schema.json")] = (
                local(json.loads(schema_path.read_text()))
            )
        routes = {
            "/simulation/schema": "simulation-schema",
            "/simulation/presets": "simulation-presets",
            "/simulations": "simulation-run",
            "/simulations/{run_id}": "simulation-run",
            "/simulations/{run_id}/result": "simulation-result",
            "/simulations/{run_id}/cancel": "simulation-run",
            "/simulations/{run_id}/events": "simulation-events",
        }
        for path, resource in routes.items():
            for method, operation in schema["paths"][prefix + path].items():
                if method not in ("get", "post"):
                    continue
                code = "202" if path == "/simulations" else "200"
                operation["responses"][code] = {
                    "description": "Pinned Ecosystem Contracts 1.0.0",
                    "content": {
                        "application/json": {"schema": {"$ref": "#/components/schemas/Protocol_" + resource}}
                    },
                }
                for status in (401, 403, 404, 409, 410, 413, 422, 429, 503):
                    operation["responses"][str(status)] = {
                        "description": "Typed failure",
                        "content": {
                            "application/json": {"schema": {"$ref": "#/components/schemas/Protocol_error"}}
                        },
                    }
                if resource == "simulation-events":
                    operation["responses"]["200"]["content"]["text/event-stream"] = {
                        "schema": {"type": "string"},
                        "example": "id: 1\nevent: step\ndata: {validated simulation-event}\n\n",
                    }
        schema["info"]["description"] = (
            "Public full prefix shown; edge-stripped internal paths are also supported. Cookie/Origin/CSRF session bootstrap is documented in SELF_HOST.md."
        )
        app.openapi_schema = schema
        return schema

    app.openapi = spec
