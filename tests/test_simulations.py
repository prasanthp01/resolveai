import hashlib
import json
from pathlib import Path
import pytest
from app.core.config import settings
from app.agents.investigate import scenarios, validate_report


HISTORICAL = json.loads(Path("tests/recorded-simulations.json").read_text())["recordings"]


@pytest.mark.parametrize("slug", [s["slug"] for s in scenarios()])
async def test_public_trace_preserves_historical_backend_recording(client, slug):
    settings().demo_mode = True
    response = await client.get(f"/api/v1/demo/scenarios/{slug}/trace")
    assert response.status_code == 200
    trace = response.json()
    original = Path("demo/simulations") / f"{slug}.json"
    manifest = HISTORICAL[original.name]
    assert hashlib.sha256(original.read_bytes()).hexdigest() == manifest["sha256"]
    assert trace == json.loads(original.read_text())
    assert trace["app_version"] == manifest["app_version"] == "0.3.0"
    assert trace["recording"]["code_fingerprint"] == manifest["code_fingerprint"]
    assert trace["accepted"]["http_status"] == 202
    assert trace["states"]["queued"]["job_status"] == "PENDING"
    assert trace["states"]["claimed"]["incident_status"] == "INVESTIGATING"
    assert trace["states"]["completed"]["job_status"] == "SUCCEEDED"
    assert trace["final_response"]["body"]["status"] == "REPORT_READY"
    validate_report(trace["analysis"]["report"], trace["evidence"])
    cases = trace["edge_cases"]
    assert [cases[k]["http_status"] for k in ["duplicate", "conflict", "invalid", "unauthorized"]] == [
        200,
        409,
        422,
        401,
    ]
    assert cases["duplicate"]["body"]["id"] == trace["accepted"]["body"]["id"]
    assert len(set(cases["unchanged_counts"].values())) == 1
    assert cases["invalid_citation_rejected"]
    assert not cases["lease_recovery"]["stale_worker_saved"]
    assert cases["lease_recovery"]["persisted_report_count"] == 1
    assert (await client.post("/api/v1/events", json=trace["request"]["body"])).status_code == 403


async def test_trace_allowlist_and_public_data(client):
    settings().demo_mode = True
    assert (await client.get("/api/v1/demo/scenarios/unknown/trace")).status_code == 404
    for path in Path("demo/simulations").glob("*.json"):
        trace = json.loads(path.read_text())
        assert trace["request"]["headers"]["Authorization"] == "Bearer <integration-token>"
        assert "DATABASE_URL" not in path.read_text()
        assert "/Users/" not in path.read_text()
        assert {item["action"] for item in trace["audit"]} >= {
            "INCIDENT_ACCEPTED",
            "JOB_CLAIMED",
            "REPORT_SAVED",
        }
