import argparse
import asyncio
import getpass
from datetime import timedelta
from sqlalchemy import select, delete
from app.db.session import Session
from app.core.config import settings
from app.core.security import ph
from app.models.incident import (
    User,
    Incident,
    Job,
    Evidence,
    Report,
    InvestigationRun,
    Audit,
    Usage,
    LoginSession,
    WebhookReplay,
    RateLimit,
    now,
)


async def bootstrap(username, password):
    if settings().demo_mode:
        raise SystemExit("Set DEMO_MODE=false before creating a private administrator")
    if len(password) < 16:
        raise SystemExit("Use at least 16 characters")
    async with Session() as db:
        if await db.scalar(select(User.id).limit(1)):
            raise SystemExit("Owner already exists; bootstrap is one-time")
        db.add(User(username=username, password_hash=ph.hash(password)))
        await db.commit()


async def purge(days):
    if days < 7:
        raise SystemExit("Minimum retention is 7 days")
    async with Session() as db:
        ids = list(
            (
                await db.scalars(
                    select(Incident.id).where(
                        Incident.created_at < now() - timedelta(days=days),
                        Incident.status.in_(["REPORT_READY", "NEEDS_REVIEW", "FAILED"]),
                    )
                )
            ).all()
        )
        for model in [Report, Evidence, Usage, InvestigationRun, Audit, Job]:
            await db.execute(delete(model).where(getattr(model, "incident_id").in_(ids)))
        await db.execute(delete(Incident).where(Incident.id.in_(ids)))
        await db.execute(delete(LoginSession).where(LoginSession.expires_at < now()))
        await db.execute(delete(WebhookReplay).where(WebhookReplay.expires_at < now()))
        import time

        await db.execute(delete(RateLimit).where(RateLimit.window < int(time.time()) - days * 86400))
        db.add(
            Audit(actor="maintenance", action="RETENTION_PURGE", details={"count": len(ids), "days": days})
        )
        await db.commit()
        print(f"Purged {len(ids)} expired incidents; retained purge receipt")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("bootstrap")
    p.add_argument("--username", default="owner")
    p = sub.add_parser("purge")
    p.add_argument("--days", type=int, default=30)
    args = parser.parse_args()
    asyncio.run(
        bootstrap(args.username, getpass.getpass("New owner password: "))
        if args.command == "bootstrap"
        else purge(args.days)
    )
