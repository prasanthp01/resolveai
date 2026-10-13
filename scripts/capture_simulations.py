"""Record real API/worker results using synthetic evidence and a fresh isolated DB.

Provision/migrate an empty localhost:55433 database named resolveai_simulation_*
and supply DATABASE_URL. This script never deletes data or contacts a model.
HTTP calls use ASGITransport; worker stages are invoked individually for inspection.
"""

import argparse
import asyncio
import json
import secrets
import sys
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import func, select, update  # noqa: E402
from app.main import app  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.security import digest  # noqa: E402
from app.db.session import Session, engine  # noqa: E402
from app.models.incident import Application, Environment, Credential, Incident, Job, Report, now, uid  # noqa: E402
from app.jobs.worker import claim, gather, complete  # noqa: E402
from app.agents.investigate import scenarios, validate_report  # noqa: E402
from app.services.simulations import simulation_fingerprint  # noqa: E402
from app.version import APP_VERSION  # noqa: E402


def response(value):
    return {
        "http_status": value.status_code,
        "request_id": value.headers.get("x-request-id"),
        "body": value.json(),
    }


async def state(incident_id):
    async with Session() as db:
        incident = await db.get(Incident, incident_id)
        job = await db.scalar(select(Job).where(Job.incident_id == incident_id))
        assert incident is not None and job is not None, "Capture requires a persisted incident and job"
        return {
            "incident_id": incident.id,
            "incident_status": incident.status,
            "severity": incident.severity,
            "job_id": job.id,
            "job_status": job.status,
            "attempts": job.attempts,
            "claim_version": job.version,
            "lease_until": job.lease_until.isoformat() if job.lease_until else None,
        }


async def capture(destination):
    url = urlsplit(settings().database_url)
    if not (
        url.hostname in {"127.0.0.1", "localhost"}
        and url.port == 55433
        and url.path.startswith("/resolveai_simulation_")
    ):
        raise SystemExit("Requires an isolated localhost:55433 resolveai_simulation_* database")
    if destination.exists():
        raise SystemExit("Use a new destination to preserve previous recordings")
    settings().demo_mode = False
    settings().llm_enabled = False
    secret = secrets.token_urlsafe(32)
    async with Session() as db:
        if await db.scalar(select(func.count()).select_from(Application)):
            raise SystemExit("Refusing a non-empty simulation database")
        application = Application(id=uid(), name="Synthetic simulation", slug="synthetic-simulation")
        db.add(application)
        await db.flush()
        environment = Environment(id=uid(), application_id=application.id, name="synthetic")
        db.add(environment)
        await db.flush()
        db.add(
            Credential(
                environment_id=environment.id,
                name="Temporary capture source",
                token_hash=digest(secret),
                expires_at=now() + timedelta(hours=1),
            )
        )
        await db.commit()
    destination.mkdir(parents=True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://simulation.invalid") as client:
        headers = {"Authorization": "Bearer " + secret}
        for scenario in scenarios():
            payload = {
                "event_id": "simulation-" + scenario["slug"],
                "service": scenario["service"],
                "error_rate": scenario["error_rate"],
                "message": scenario["description"],
                "mode": "fixture",
                "scenario": scenario["slug"],
            }
            accepted = await client.post("/api/v1/events", json=payload, headers=headers)
            assert accepted.status_code == 202
            incident_id = accepted.json()["id"]
            queued = await state(incident_id)
            async with Session() as db:
                before = await db.scalar(select(func.count()).select_from(Incident))
            duplicate = await client.post("/api/v1/events", json=payload, headers=headers)
            conflict = await client.post(
                "/api/v1/events", json=payload | {"message": "Changed event content"}, headers=headers
            )
            invalid = await client.post("/api/v1/events", json=payload | {"error_rate": 101}, headers=headers)
            unauthorized = await client.post("/api/v1/events", json=payload)
            assert duplicate.status_code == 200 and duplicate.json()["id"] == incident_id
            assert [conflict.status_code, invalid.status_code, unauthorized.status_code] == [409, 422, 401]
            async with Session() as db:
                job_count = await db.scalar(select(func.count()).select_from(Job))
                incident_count = await db.scalar(select(func.count()).select_from(Incident))
            assert job_count == incident_count == before
            c = await claim("simulation-worker")
            assert c and c["incident_id"] == incident_id
            claimed = await state(incident_id)
            evidence, report, steps = await gather(c)
            validate_report(report, evidence)
            bad = report | {"supporting_evidence_ids": ["unknown-evidence"]}
            try:
                validate_report(bad, evidence)
            except ValueError:
                citation_rejected = True
            else:
                raise AssertionError("Invalid evidence citation accepted")
            assert await complete(c, evidence, report, steps)
            final = await client.get(f"/api/v1/incidents/{incident_id}/report", headers=headers)
            audit = await client.get(f"/api/v1/incidents/{incident_id}/timeline", headers=headers)
            assert final.status_code == 200 and final.json()["status"] == "REPORT_READY"
            completed = await state(incident_id)

            # Deliberate fault injection on a separate synthetic incident, never the main run.
            recovered = await client.post(
                "/api/v1/events", json=payload | {"event_id": payload["event_id"] + "-lease"}, headers=headers
            )
            assert recovered.status_code == 202
            old = await claim("expired-worker")
            assert old and old["incident_id"] == recovered.json()["id"]
            async with Session() as db:
                await db.execute(
                    update(Job).where(Job.id == old["id"]).values(lease_until=now() - timedelta(seconds=1))
                )
                await db.commit()
            new = await claim("replacement-worker")
            assert new and new["version"] == old["version"] + 1
            stale_saved = await complete(old, evidence, report, [])
            assert not stale_saved
            new_evidence, new_report, new_steps = await gather(new)
            assert await complete(new, new_evidence, new_report, new_steps)
            async with Session() as db:
                reports = await db.scalar(
                    select(func.count()).select_from(Report).where(Report.incident_id == new["incident_id"])
                )
            assert reports == 1
            recording = {
                "schema_version": "1.0.0",
                "app_version": APP_VERSION,
                "slug": scenario["slug"],
                "title": scenario["title"],
                "recording": {
                    "recorded_at": now().isoformat(),
                    "mode": "verified-synthetic-replay",
                    "method": "Real FastAPI handlers via ASGITransport and PostgreSQL; worker claim, gather and complete invoked individually. Fixture evidence; no model or external connector calls.",
                    "code_fingerprint": simulation_fingerprint(),
                    "timing_note": "Timestamps are from the local capture. Replay pacing is a teaching aid, not a latency benchmark.",
                },
                "request": {
                    "method": "POST",
                    "path": "/api/v1/events",
                    "headers": {
                        "Authorization": "Bearer <integration-token>",
                        "Content-Type": "application/json",
                    },
                    "body": payload,
                },
                "accepted": response(accepted),
                "states": {"queued": queued, "claimed": claimed, "completed": completed},
                "claim": c,
                "evidence": evidence,
                "analysis": {"report": report, "citations_validated": True, "live_model_called": False},
                "final_response": response(final),
                "audit": audit.json(),
                "edge_cases": {
                    "duplicate": response(duplicate),
                    "conflict": response(conflict),
                    "invalid": response(invalid),
                    "unauthorized": response(unauthorized),
                    "unchanged_counts": {
                        "incidents_before": before,
                        "incidents_after": incident_count,
                        "jobs_after": job_count,
                    },
                    "invalid_citation_rejected": citation_rejected,
                    "lease_recovery": {
                        "fault": "Test harness forced the first worker lease into the past on a separate synthetic incident.",
                        "old_claim_version": old["version"],
                        "new_claim_version": new["version"],
                        "stale_worker_saved": stale_saved,
                        "replacement_worker_saved": True,
                        "persisted_report_count": reports,
                        "final_state": await state(new["incident_id"]),
                    },
                },
            }
            serialized = json.dumps(recording, indent=2) + "\n"
            assert secret not in serialized
            (destination / f"{scenario['slug']}.json").write_text(serialized)
            print(scenario["slug"], "PASS: 202 -> QUEUED -> INVESTIGATING -> REPORT_READY; six edge cases")
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    asyncio.run(capture(parser.parse_args().destination))
