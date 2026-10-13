"""Exercise a running loopback sandbox with the frozen canonical SDK, including semantics."""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests/vendor"))
from ecosystem_contracts import SchemaRegistry  # noqa: E402

PREFIX = "/api/projects/resolveai"
CONTRACTS = SchemaRegistry(ROOT / "contracts/ecosystem-v1")


def semantic_output(result):
    """Remove only measured durations and two generated per-run identifiers."""
    value = json.loads(json.dumps(result["output"]))
    for step in value["step_details"]:
        step.pop("duration_ms", None)
        technical = step["technical"]
        technical.pop("request_key", None)
        ticket = technical.get("simulated_ticket_idempotency", {}).get("artifact", {})
        ticket.pop("id", None)
    return value


def check(base, revision, output):
    assert urlsplit(base).hostname in ("127.0.0.1", "localhost"), "Local synthetic verification only"
    records = []
    inputs = ROOT / "docs/adoption-0.3.5/inputs"

    def read(client, path, name, status=200, **kwargs):
        response = client.get(PREFIX + path, **kwargs)
        assert response.status_code == status, (path, response.status_code)
        value = response.json()
        CONTRACTS.validate(name, value)
        return value

    def bootstrap(client):
        response = client.get(PREFIX + "/simulation/session")
        assert response.status_code == 200
        assert "HttpOnly" in response.headers["set-cookie"]
        assert "SameSite=strict" in response.headers["set-cookie"]
        assert "Path=" + PREFIX in response.headers["set-cookie"]
        client.headers.update({"Origin": base, "X-CSRF-Token": response.json()["csrf_token"]})

    def run(data, *, fault=None, cancel=False):
        data = json.loads(json.dumps(data))
        data["client_correlation_id"] = "adoption-" + uuid4().hex
        if fault:
            data["input"]["fault"] = fault
        CONTRACTS.validate("simulation-start", data)
        with httpx.Client(base_url=base, timeout=10) as client:
            bootstrap(client)
            schema = read(client, "/simulation/schema", "simulation-schema")
            read(client, "/simulation/presets", "simulation-presets")
            accepted = client.post(PREFIX + "/simulations", json=data)
            assert accepted.status_code == 202
            state = accepted.json()
            CONTRACTS.validate("simulation-run", state)
            run_id = state["run_id"]
            route = "/simulations/" + run_id
            if cancel:
                response = client.post(PREFIX + route + "/cancel", json={})
                assert response.status_code == 200
                CONTRACTS.validate("simulation-run", response.json())
            until = time.monotonic() + 8
            while time.monotonic() < until:
                state = read(client, route, "simulation-run")
                if state["status"] in ("SUCCEEDED", "FAILED", "CANCELLED"):
                    break
                time.sleep(0.1)
            else:
                raise AssertionError("Run did not terminate within the bounded deadline")
            result = read(client, route + "/result", "simulation-result")
            assert result["provenance"]["source_revision"] == revision
            assert result["app_version"] == "0.3.5"
            assert result["usage"]["provider_calls"] == 0
            assert result["cost"]["kind"] == "NONE" and result["cost"]["value"] == 0
            batch = read(client, route + "/events", "simulation-events")
            assert batch["terminal"]
            events = batch["events"]
            assert len(events) == state["last_sequence"] == batch["next_sequence"]
            assert len({e["event_id"] for e in events}) == len(events)
            for sequence, event in enumerate(events, 1):
                CONTRACTS.validate("simulation-event", event)
                assert (event["run_id"], event["project_id"], event["sequence"]) == (
                    run_id,
                    "resolveai",
                    sequence,
                )
            cursor = min(3, len(events))
            replay = read(client, route + f"/events?after={cursor}", "simulation-events")
            assert replay["events"] == events[cursor:]
            response = client.get(
                PREFIX + route + "/events",
                headers={"Accept": "text/event-stream", "Last-Event-ID": str(cursor)},
            )
            assert response.status_code == 200
            frames = [
                json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
            ]
            assert frames[:-1] == replay["events"]
            assert frames[-1]["last_sequence"] == len(events)
            assert "event: end" in response.text
            for frame in frames[:-1]:
                CONTRACTS.validate("simulation-event", frame)
            read(client, route + "/events?after=999", "error", status=409)
            invalid = client.post(PREFIX + "/simulations", json={**data, "unexpected": "synthetic"})
            assert invalid.status_code == 422
            CONTRACTS.validate("error", invalid.json())
            with httpx.Client(base_url=base, timeout=10) as other:
                read(other, route + "/result", "error", status=401)
                bootstrap(other)
                read(other, route + "/result", "error", status=404)
            records.append(
                {
                    "input": data,
                    "input_schema_sha256": schema["input_schema_sha256"],
                    "state": state,
                    "events": events,
                    "result": result,
                    "checks": [
                        "canonical SDK semantics",
                        "ordered scoped events",
                        "SSE/poll replay",
                        "invalid cursor 409",
                        "unknown input 422",
                        "unauthenticated 401",
                        "foreign run 404",
                    ],
                }
            )
            return result

    normal = json.loads((inputs / "connection-pressure.json").read_text())
    edited = json.loads((inputs / "insufficient-evidence.json").read_text())
    first = run(normal)
    repeated = run(normal)
    second = run(edited)
    repeated_second = run(edited)
    assert semantic_output(first) == semantic_output(repeated)
    assert semantic_output(second) == semantic_output(repeated_second)
    assert first["output"]["semantic_sha256"] == repeated["output"]["semantic_sha256"]
    assert second["output"]["semantic_sha256"] == repeated_second["output"]["semantic_sha256"]
    assert first["output"]["semantic_sha256"] != second["output"]["semantic_sha256"]
    assert first["output"]["hypotheses"][0]["title"] == "Database connection pressure"
    assert second["output"]["hypotheses"] == []
    for fault in ("connector_timeout", "provider_429", "invalid_model_output", "workflow_timeout"):
        result = run(normal, fault=fault)
        assert result["output"]["faults"]
        assert any(d["technical"].get("error") for d in result["output"]["step_details"])
        if fault == "workflow_timeout":
            assert result["status"] == "FAILED" and result["errors"]
        else:
            assert result["status"] == "SUCCEEDED" and result["errors"] == [] and result["warnings"]
    cancelled = run(normal, cancel=True)
    assert cancelled["status"] == "CANCELLED" and cancelled["errors"]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "status": "PASS",
                "scope": "Local real HTTP; synthetic adapters; no cross-service adoption claim",
                "contract_version": "1.0.0",
                "app_version": "0.3.5",
                "tested_source_revision": revision,
                "verified_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "run_count": len(records),
                "runs": records,
            },
            indent=2,
        )
        + "\n"
    )
    print(
        f"PASS: {len(records)} real HTTP runs, canonical semantics, replay, ownership and seed repeatability"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:18135")
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--output", type=Path, default=Path("work/contracts-http.json"))
    args = parser.parse_args()
    check(args.base_url.rstrip("/"), args.expected_sha, args.output)
