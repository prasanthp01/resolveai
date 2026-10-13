"""Pure deterministic investigation. No network, SQL, shell, credentials or model calls."""

import hashlib
import json
from app.policies import severity
from app.sandbox.contracts import SimulationInput, FIXTURES_VERSION, RULES_VERSION, WORKFLOW_VERSION

LOGS = {
    "pool_timeout": "Synthetic application: connection pool acquisition timed out.",
    "query_timeout": "Synthetic application: query duration exceeded the request deadline.",
    "cache_miss": "Synthetic cache: eviction counter increased during the incident window.",
    "release_error": "Synthetic deployment: error rate increased after release demo-2026.10.",
    "upstream_limit": "Synthetic upstream: HTTP 429; retry after the configured interval.",
    "normal": "Synthetic application: diagnostic sample contains no correlated error.",
    "injection_attempt": "[QUARANTINED: fixture contains an instruction attempt, never executed]",
}


def evidence_for(value: SimulationInput, unavailable: bool = False):
    evidence = [
        {
            "id": "E1",
            "source": "synthetic.alert",
            "data": {"error_rate": value.error_rate, "latency_ms": value.latency_ms},
        },
        {
            "id": "E3",
            "source": "synthetic.redis.memory",
            "data": {
                "used_memory": value.redis_memory_mb,
                "maxmemory": value.redis_maxmemory_mb,
                "evicted_keys": value.redis_evictions,
                "units": "MiB",
            },
        },
        {
            "id": "E4",
            "source": "synthetic.deployment",
            "data": {
                "recent_deployment": value.recent_deployment,
                "previous_error_rate": value.previous_error_rate,
            },
        },
        {
            "id": "E5",
            "source": "synthetic.upstream",
            "data": {"status_429": value.upstream_429, "retry_after_seconds": value.retry_after_seconds},
        },
        {
            "id": "E6",
            "source": "synthetic.logs",
            "data": {"fixture": value.log_fixture, "excerpt": LOGS[value.log_fixture], "trusted": False},
        },
        {
            "id": "E7",
            "source": "synthetic.decoy",
            "data": {
                "service": "unrelated-batch-job",
                "cpu_percent": 97,
                "same_service": False,
                "same_window": False,
            },
        },
    ]
    if not unavailable:
        evidence.insert(
            1,
            {
                "id": "E2",
                "source": "synthetic.postgres.connections_locks",
                "data": {
                    "connections": value.db_connections,
                    "max_connections": value.db_max_connections,
                    "cpu_percent": value.db_cpu_percent,
                    "lock_waiters": value.db_lock_waiters,
                    "slow_queries": value.slow_queries,
                },
            },
        )
    for item in evidence:
        item["provenance"] = {
            "kind": "synthetic",
            "fixtures_version": FIXTURES_VERSION,
            "derived_from": "validated visitor metrics or allowlisted fixture",
        }
    return evidence


def correlate(value: SimulationInput, evidence):
    available = {e["id"] for e in evidence}
    hypotheses, decisions = [], []

    def rule(rule_id, title, supports, contradicts, rationale, action):
        present = bool(supports) and all(e in available for e in supports)
        decision = {
            "rule_id": rule_id,
            "outcome": "SUPPORTED" if present else "NOT_SUPPORTED",
            "supporting_evidence_ids": supports if present else [],
            "contradicting_evidence_ids": contradicts,
            "rationale": rationale,
        }
        decisions.append(decision)
        if present:
            hypotheses.append(
                {
                    "title": title,
                    "rationale": rationale,
                    "evidence_ids": supports,
                    "contradicting_evidence_ids": contradicts,
                    "confidence": "limited" if contradicts else "moderate",
                    "next_action": action,
                }
            )

    db = value.db_connections / value.db_max_connections
    rule(
        "database-pressure",
        "Database connection pressure",
        ["E1", "E2"] if db >= 0.85 else [],
        ["E6"] if value.log_fixture == "normal" else [],
        "Connections at or above 85% support pressure; healthy connections do not. Missing diagnostics cannot establish database health.",
        "Review pool limits and independent connection telemetry before changing capacity.",
    )
    slow = (
        value.slow_queries > 0
        and value.latency_ms >= 1000
        and (value.db_cpu_percent >= 85 or value.db_lock_waiters > 0)
    )
    rule(
        "slow-query",
        "Slow queries or lock contention",
        ["E1", "E2", "E6"] if slow else [],
        ["E6"] if value.log_fixture not in ("query_timeout", "pool_timeout") else [],
        "Slow queries plus high latency and CPU pressure or lock waits support a database latency hypothesis.",
        "Inspect approved query plans and lock summaries; do not run arbitrary visitor SQL.",
    )
    cache = value.redis_memory_mb / value.redis_maxmemory_mb >= 0.9 and value.redis_evictions > 0
    rule(
        "cache-pressure",
        "Redis memory pressure",
        ["E3"] if cache else [],
        ["E6"] if value.log_fixture not in ("cache_miss", "pool_timeout") else [],
        "At least 90% memory utilization and nonzero evictions support cache pressure; a cumulative counter alone cannot prove causation.",
        "Compare eviction deltas with request latency before changing cache policy.",
    )
    release = value.recent_deployment and value.error_rate >= max(1, value.previous_error_rate + 5)
    rule(
        "release-regression",
        "Release-related regression",
        ["E1", "E4"] if release else [],
        ["E2"] if (db >= 0.85 or slow) and "E2" in available else [],
        "A deployment followed by an error-rate increase of at least five percentage points supports correlation; competing infrastructure evidence weakens it.",
        "Compare release versions and request traces; a person must approve any rollback.",
    )
    rule(
        "upstream-rate-limit",
        "Upstream rate limiting",
        ["E5"] if value.upstream_429 > 0 else [],
        [],
        "Observed upstream 429 responses support throttling, not a diagnosis of the upstream service.",
        f"Respect the synthetic Retry-After of {value.retry_after_seconds} seconds and review request volume.",
    )
    return hypotheses, decisions


def report_for(value: SimulationInput, evidence):
    hypotheses, decisions = correlate(value, evidence)
    body = {
        "summary": f"{value.service}: "
        + (
            "evidence supports " + ", ".join(h["title"].lower() for h in hypotheses) + "."
            if hypotheses
            else "insufficient evidence to identify a plausible cause."
        ),
        "severity": severity(value.error_rate),
        "impact": f"{value.error_rate:g}% synthetic errors; {value.latency_ms} ms latency. Affected real users are unknown.",
        "hypotheses": hypotheses,
        "decisions": decisions,
        "supporting_evidence_ids": sorted({e for h in hypotheses for e in h["evidence_ids"]}),
        "contradicting_evidence_ids": sorted(
            {e for h in hypotheses for e in h["contradicting_evidence_ids"]}
        ),
        "excluded_evidence": [
            {"id": "E7", "reason": "Different service and time window; decoy cannot support this incident."}
        ],
        "uncertainty": "Synthetic correlations are hypotheses, not proven production root causes. "
        + ("Database evidence is unavailable. " if "E2" not in {e["id"] for e in evidence} else "")
        + "Collect independent telemetry before acting.",
        "recommended_next_steps": [h["next_action"] for h in hypotheses]
        or ["Collect additional correlated diagnostics and request human review."],
        "safety": {
            "human_review_required": True,
            "actions_executed": [],
            "outbound_requests": 0,
            "connector_kind": "synthetic",
        },
        "reliability_impact": "Diagnostic coverage is reduced."
        if "E2" not in {e["id"] for e in evidence}
        else "All configured synthetic signals were collected.",
        "cost_impact": {
            "external_model_spend": 0,
            "currency": "USD",
            "kind": "NONE",
            "hosting_cost": "not measured per run",
        },
        "versions": {
            "rules": RULES_VERSION,
            "workflow": WORKFLOW_VERSION,
            "fixtures": FIXTURES_VERSION,
            "prompt": None,
            "model": None,
        },
        "provenance": {
            "kind": "synthetic",
            "connector_kind": "synthetic",
            "seed": value.seed,
            "input_sha256": hashlib.sha256(
                json.dumps(value.model_dump(), sort_keys=True).encode()
            ).hexdigest(),
        },
        "limitations": [
            "No live service, database, provider or real customer is contacted.",
            "Confidence is a qualitative rule assessment, not a calibrated probability.",
            "Run storage is temporary; server restart invalidates sessions and runs.",
        ],
    }
    body["semantic_sha256"] = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
    return body
