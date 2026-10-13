import hashlib
import json
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.models.incident import Incident, Job, Audit, uid
from app.core.security import redact
from app.agents.investigate import severity


async def ingest(db, credential, payload):
    # Rollback expires ORM objects; keep the identity available for a raced insert.
    source_id = credential.id
    # Omitted timestamps must not defeat retries of otherwise identical event bodies.
    canonical = payload.model_dump(mode="json", exclude_unset=True)
    hashed = hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()
    old = await db.scalar(
        select(Incident).where(Incident.source_id == source_id, Incident.event_id == payload.event_id)
    )
    if old:
        if old.payload_hash != hashed:
            raise HTTPException(409, "Event ID reused with a different payload")
        return old, False
    if (await db.scalar(select(func.count()).select_from(Incident))) >= 10000:
        raise HTTPException(429, "Incident storage limit reached; run retention maintenance")
    incident = Incident(
        id=uid(),
        source_id=source_id,
        environment_id=credential.environment_id,
        event_id=payload.event_id,
        payload_hash=hashed,
        service=redact(payload.service),
        message=redact(payload.message),
        error_rate=payload.error_rate,
        observed_at=payload.observed_at,
        severity=severity(payload.error_rate),
        mode=payload.mode,
        scenario=payload.scenario,
    )
    db.add(incident)
    try:
        await db.flush()
        db.add(Job(incident_id=incident.id))
        db.add(
            Audit(
                incident_id=incident.id,
                actor=source_id,
                action="INCIDENT_ACCEPTED",
                details={"status": "QUEUED"},
            )
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        old = await db.scalar(
            select(Incident).where(Incident.source_id == source_id, Incident.event_id == payload.event_id)
        )
        if old and old.payload_hash == hashed:
            return old, False
        raise HTTPException(409, "Conflicting event")
    return incident, True
