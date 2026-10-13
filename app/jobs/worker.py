import time
import asyncio
import random
import socket
from datetime import timedelta
from typing import cast
from sqlalchemy.engine import CursorResult
from sqlalchemy import select, update, or_, and_, func, text
from app.db.session import Session
from app.models.incident import (
    Job,
    Incident,
    InvestigationRun,
    Evidence,
    Report,
    Audit,
    Connector,
    Usage,
    now,
    uid,
)
from app.agents.investigate import scenarios, recorded_report, live_report
from app.connectors.gateway import execute
from app.core.config import settings


async def claim(owner):
    async with Session() as db:
        async with db.begin():
            job = await db.scalar(
                select(Job)
                .where(
                    or_(
                        and_(Job.status.in_(["PENDING", "RETRY_SCHEDULED"]), Job.next_attempt_at <= now()),
                        and_(Job.status == "CLAIMED", Job.lease_until < now()),
                    )
                )
                .order_by(Job.next_attempt_at)
                .with_for_update(skip_locked=True)
                .limit(1)
            )
            if not job:
                return None
            if job.attempts >= 3:
                job.status = "DEAD_LETTER"
                await db.execute(
                    update(InvestigationRun)
                    .where(
                        InvestigationRun.incident_id == job.incident_id, InvestigationRun.status == "RUNNING"
                    )
                    .values(status="ABANDONED", completed_at=now())
                )
                db.add(
                    Audit(
                        incident_id=job.incident_id,
                        actor=owner,
                        action="RETRY_BUDGET_EXHAUSTED",
                        details={"attempts": job.attempts},
                    )
                )
                await db.execute(
                    update(Incident).where(Incident.id == job.incident_id).values(status="NEEDS_REVIEW")
                )
                return None
            job.status = "CLAIMED"
            job.owner = owner
            job.version += 1
            job.attempts += 1
            job.lease_until = now() + timedelta(seconds=60)
            await db.execute(
                update(InvestigationRun)
                .where(InvestigationRun.incident_id == job.incident_id, InvestigationRun.status == "RUNNING")
                .values(status="ABANDONED", completed_at=now())
            )
            run = InvestigationRun(id=uid(), incident_id=job.incident_id, claim_version=job.version)
            db.add(run)
            await db.execute(
                update(Incident).where(Incident.id == job.incident_id).values(status="INVESTIGATING")
            )
            db.add(
                Audit(
                    incident_id=job.incident_id,
                    actor=owner,
                    action="JOB_CLAIMED",
                    details={"claim_version": job.version, "attempt": job.attempts},
                )
            )
            return {
                "id": job.id,
                "incident_id": job.incident_id,
                "version": job.version,
                "owner": owner,
                "run_id": run.id,
                "attempt": job.attempts,
            }


def fence(c):
    return (
        Job.id == c["id"],
        Job.version == c["version"],
        Job.owner == c["owner"],
        Job.status == "CLAIMED",
        Job.lease_until > now(),
    )


async def heartbeat(c):
    async with Session() as db:
        result = await db.execute(
            update(Job).where(*fence(c)).values(lease_until=now() + timedelta(seconds=60))
        )
        await db.commit()
        return cast(CursorResult, result).rowcount == 1


async def reserve_usage(incident):
    async with Session() as db:
        async with db.begin():
            await db.execute(text("SELECT pg_advisory_xact_lock(8713301)"))
            n = await db.scalar(
                select(func.count())
                .select_from(Usage)
                .where(Usage.created_at >= now().replace(hour=0, minute=0, second=0, microsecond=0))
            )
            if n >= settings().llm_daily_requests:
                raise ValueError("DAILY_MODEL_BUDGET")
            usage = Usage(id=uid(), incident_id=incident.id, model=settings().llm_model)
            db.add(usage)
            return usage.id


async def gather(c):
    async with Session() as db:
        incident = await db.get(Incident, c["incident_id"])
        if incident is None:
            raise ValueError("Incident missing")
        run = await db.get(InvestigationRun, c["run_id"])
        started_at = run.created_at.isoformat() if run else now().isoformat()
        connectors = list(
            (
                await db.scalars(
                    select(Connector)
                    .where(Connector.environment_id == incident.environment_id, Connector.enabled.is_(True))
                    .limit(4)
                )
            ).all()
        )
    evidence = []
    steps = []
    if incident.mode == "fixture":
        scenario = next((s for s in scenarios() if s["slug"] == incident.scenario), None)
        if scenario:
            evidence = [
                {
                    "id": uid(),
                    "source": e["source"],
                    "data": e["data"],
                    "observed_at": incident.observed_at.isoformat(),
                }
                for e in scenario["evidence"]
            ]
        report = recorded_report(evidence, incident.error_rate, incident.service)
    else:
        for connector in connectors:
            tool_started = time.monotonic()
            observed_at = now().isoformat()
            operation = "connections" if connector.kind == "postgres" else "memory"
            try:
                result = await execute(
                    connector,
                    "connections" if connector.kind == "postgres" else "memory",
                    incident.environment_id,
                )
                evidence.append({"id": uid(), **result, "observed_at": now().isoformat()})
                steps.append(
                    {
                        "connector": connector.id,
                        "operation": operation,
                        "status": "COLLECTED",
                        "timestamp": observed_at,
                        "duration_ms": round((time.monotonic() - tool_started) * 1000),
                        "evidence_id": evidence[-1]["id"],
                    }
                )
            except Exception:
                steps.append(
                    {
                        "connector": connector.id,
                        "operation": operation,
                        "status": "UNAVAILABLE_OR_DENIED",
                        "timestamp": observed_at,
                        "duration_ms": round((time.monotonic() - tool_started) * 1000),
                    }
                )
        if not settings().llm_enabled or (
            settings().llm_provider != "agentops" and (not settings().llm_api_key or not settings().llm_model)
        ):
            report = recorded_report(evidence, incident.error_rate, incident.service)
            report.update(
                investigation_mode="needs_configuration",
                uncertainty="Live model is not configured. No live AI analysis was performed.",
            )
        else:
            usage_id = await reserve_usage(incident)
            from app.agents.routing import AIUnavailable

            try:
                report, tokens = await live_report(evidence, incident.error_rate, incident.service, c["id"])
                usage_status = "COMPLETED"
            except AIUnavailable as exc:
                report = recorded_report(evidence, incident.error_rate, incident.service)
                report.update(
                    investigation_mode="needs_configuration",
                    uncertainty=exc.reason
                    + ". Deterministic diagnostics remain available; human review is required.",
                )
                tokens, usage_status = None, exc.code
                steps.append(
                    {
                        "operation": "model_routing",
                        "status": exc.code,
                        "model_fallback": "none eligible",
                        "workflow_fallback": "deterministic diagnostics and human review",
                        "business_action_completed": False,
                    }
                )
            async with Session() as db:
                await db.execute(
                    update(Usage).where(Usage.id == usage_id).values(status=usage_status, tokens=tokens)
                )
                await db.commit()
    report["started_at"] = started_at
    report["completed_at"] = now().isoformat()
    return evidence, report, steps


async def complete(c, evidence, report, steps):
    async with Session() as db:
        async with db.begin():
            result = await db.execute(
                update(Job).where(*fence(c)).values(status="SUCCEEDED", lease_until=None, error=None)
            )
            if cast(CursorResult, result).rowcount != 1:
                return False
            for step in steps:
                db.add(
                    Audit(
                        incident_id=c["incident_id"],
                        actor=c["owner"],
                        action="TOOL_RESULT",
                        details={**step, "run_id": c["run_id"]},
                    )
                )
            for e in evidence:
                from datetime import datetime

                db.add(
                    Evidence(
                        id=e["id"],
                        incident_id=c["incident_id"],
                        run_id=c["run_id"],
                        source=e["source"],
                        data=e["data"],
                        observed_at=datetime.fromisoformat(e["observed_at"]),
                    )
                )
            await db.flush()
            old = await db.scalar(select(Report).where(Report.incident_id == c["incident_id"]))
            if old:
                old.data = report
                old.run_id = c["run_id"]
            else:
                db.add(Report(incident_id=c["incident_id"], run_id=c["run_id"], data=report))
            status = (
                "REPORT_READY"
                if report["hypotheses"] and report["investigation_mode"] != "needs_configuration"
                else "NEEDS_REVIEW"
            )
            await db.execute(update(Incident).where(Incident.id == c["incident_id"]).values(status=status))
            await db.execute(
                update(InvestigationRun)
                .where(InvestigationRun.id == c["run_id"])
                .values(status="COMPLETED", mode=report["investigation_mode"], completed_at=now())
            )
            db.add(
                Audit(
                    incident_id=c["incident_id"],
                    actor=c["owner"],
                    action="REPORT_SAVED",
                    details={
                        "status": status,
                        "evidence_count": len(evidence),
                        "connector_steps": steps,
                        "mode": report["investigation_mode"],
                    },
                )
            )
            return True


async def fail(c, code, retry_after=0):
    async with Session() as db:
        terminal = c["attempt"] >= 3
        result = await db.execute(
            update(Job)
            .where(*fence(c))
            .values(
                status="DEAD_LETTER" if terminal else "RETRY_SCHEDULED",
                lease_until=None,
                error=code,
                next_attempt_at=now()
                + timedelta(seconds=max(retry_after, min(300, 2 ** c["attempt"] + random.random()))),
            )
        )
        if cast(CursorResult, result).rowcount:
            await db.execute(
                update(Incident)
                .where(Incident.id == c["incident_id"])
                .values(status="NEEDS_REVIEW" if terminal else "QUEUED")
            )
            await db.execute(
                update(InvestigationRun)
                .where(InvestigationRun.id == c["run_id"])
                .values(status="FAILED", completed_at=now())
            )
            db.add(
                Audit(
                    incident_id=c["incident_id"],
                    actor=c["owner"],
                    action="INVESTIGATION_FAILED",
                    details={"code": code, "terminal": terminal},
                )
            )
        await db.commit()


async def run_once(owner="worker"):
    c = await claim(owner)
    if not c:
        return False

    async def pulse():
        while True:
            await asyncio.sleep(10)
            if not await heartbeat(c):
                return

    task = asyncio.create_task(pulse())
    try:
        async with asyncio.timeout(50):
            evidence, report, steps = await gather(c)
            await complete(c, evidence, report, steps)
    except Exception as exc:
        retry = 0
        if hasattr(exc, "response"):
            try:
                retry = min(3600, max(0, int(exc.response.headers.get("Retry-After", "0"))))
            except ValueError:
                from email.utils import parsedate_to_datetime

                try:
                    retry = min(
                        3600,
                        max(
                            0,
                            int(
                                (
                                    parsedate_to_datetime(exc.response.headers.get("Retry-After", "")) - now()
                                ).total_seconds()
                            ),
                        ),
                    )
                except (ValueError, TypeError):
                    pass
        await fail(c, type(exc).__name__, retry)
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    return True


async def main():
    if settings().demo_mode:
        raise SystemExit("Public demo has no worker")
    while True:
        worked = await run_once(socket.gethostname())
        await asyncio.sleep(0.2 if worked else 3)


if __name__ == "__main__":
    asyncio.run(main())
