from argon2.exceptions import VerificationError, InvalidHashError
from collections import deque
import asyncio
import hmac
import hashlib
import json
import logging
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Annotated
from fastapi import FastAPI, Depends, Request, HTTPException, Response, Query
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from sqlalchemy import select, delete, update, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from app.core.config import settings
from app.core.security import (
    owner,
    integration,
    read_identity,
    digest,
    token,
    encrypt,
    decrypt,
    ph,
    DUMMY_HASH,
    redact,
    rate_limit,
)
from app.db.session import db
from app.models.incident import (
    User,
    LoginSession,
    Application,
    Environment,
    Credential,
    Connector,
    Incident,
    Audit,
    Evidence,
    Report,
    Job,
    WebhookReplay,
    Usage,
    now,
    uid,
)
from app.schemas.contracts import (
    IncidentCreate,
    Login,
    AppCreate,
    EnvCreate,
    CredentialCreate,
    ConnectorCreate,
    Note,
)
from app.services.incidents import ingest
from app.agents.investigate import scenarios, recorded_report
from app.connectors.gateway import destination, execute, PolicyDenied
from app.services.simulations import read_simulation
from app.version import APP_VERSION

ROOT = Path(__file__).resolve().parents[1]
app = FastAPI(title="ResolveAI", version=APP_VERSION, docs_url=None, redoc_url=None, openapi_url=None)
API_BASE = settings().api_prefix.rstrip("/")
DB = Annotated[AsyncSession, Depends(db)]
log = logging.getLogger("resolveai")
_demo_requests: deque[float] = deque()


@app.middleware("http")
async def guards(request, call_next):
    request_id = uid()
    start = time.monotonic()
    request.state.request_id = request_id
    try:
        if settings().demo_mode and request.url.path.startswith("/api/"):
            while _demo_requests and _demo_requests[0] < start - 60:
                _demo_requests.popleft()
            if len(_demo_requests) >= 240:
                raise HTTPException(429, "Public demo request budget exceeded", headers={"Retry-After": "60"})
            _demo_requests.append(start)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            if settings().demo_mode:
                raise HTTPException(403, "Public demo is read-only")
            length = request.headers.get("content-length")
            if length and (not length.isdigit() or int(length) > 32768):
                raise HTTPException(413, "Request body too large")
            total = 0
            parts = []
            async for chunk in request.stream():
                total += len(chunk)
                if total > 32768:
                    raise HTTPException(413, "Request body too large")
                parts.append(chunk)
            request._body = b"".join(parts)
            if request._body and not request.headers.get("content-type", "").startswith("application/json"):
                raise HTTPException(415, "JSON content required")
        response = await call_next(request)
    except HTTPException as exc:
        response = JSONResponse(
            {"code": str(exc.status_code), "message": exc.detail, "request_id": request_id},
            status_code=exc.status_code,
            headers=exc.headers,
        )
    except Exception:
        log.error(json.dumps({"event": "request_failed", "request_id": request_id}))
        response = JSONResponse(
            {"code": "INTERNAL_ERROR", "message": "Request failed safely", "request_id": request_id},
            status_code=500,
        )
    response.headers.update(
        {
            "X-Request-ID": request_id,
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "X-Frame-Options": "DENY",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
            "Cache-Control": "no-store",
        }
    )
    if settings().cookie_secure:
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    log.info(
        json.dumps(
            {
                "event": "http",
                "request_id": request_id,
                "method": request.method,
                "status": response.status_code,
                "duration_ms": round((time.monotonic() - start) * 1000),
            }
        )
    )
    return response


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse(
        {"code": str(exc.status_code), "message": exc.detail, "request_id": request.state.request_id},
        status_code=exc.status_code,
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(
        {
            "code": "VALIDATION_ERROR",
            "message": "Invalid request fields",
            "fields": [{"field": ".".join(map(str, e["loc"])), "type": e["type"]} for e in exc.errors()],
            "request_id": request.state.request_id,
        },
        status_code=422,
    )


@app.exception_handler(IntegrityError)
async def conflict(request, exc):
    return JSONResponse(
        {
            "code": "CONFLICT",
            "message": "Resource conflicts with existing data",
            "request_id": request.state.request_id,
        },
        status_code=409,
    )


@app.exception_handler(PolicyDenied)
async def policy_error(request, exc):
    return JSONResponse(
        {"code": "POLICY_DENIED", "message": str(exc), "request_id": request.state.request_id},
        status_code=403,
    )


def public(model, fields):
    return {
        f: (getattr(model, f).isoformat() if hasattr(getattr(model, f), "isoformat") else getattr(model, f))
        for f in fields.split()
    }


INC_FIELDS = "id event_id environment_id service message error_rate observed_at severity status mode scenario note created_at"


@app.get("/health")
@app.get("/health/live")
async def health():
    return {"service": "resolveai-api", "status": "OK"}


@app.get("/health/ready")
async def ready(session: DB):
    if settings().demo_mode:
        return {"status": "ready", "mode": "synthetic", "database_required": False}
    try:
        async with asyncio.timeout(2):
            await session.execute(text("SELECT 1"))
    except (SQLAlchemyError, TimeoutError, OSError):
        raise HTTPException(503, "Database unavailable")
    return {"status": "ready", "mode": "private"}


@app.get(API_BASE + "/config")
async def config():
    return {
        "demo": settings().demo_mode,
        "version": APP_VERSION,
        "build_sha": settings().build_sha,
        "live_ai_enabled": False if settings().demo_mode else settings().llm_enabled,
    }


@app.get(API_BASE + "/openapi.json")
async def schema(request: Request, session: DB):
    await owner(request, session)
    return app.openapi()


@app.post(API_BASE + "/auth/login")
async def login(payload: Login, request: Request, response: Response, session: DB):
    if settings().demo_mode:
        raise HTTPException(403, "Public demo is read-only")
    if request.headers.get("origin") != settings().public_origin:
        raise HTTPException(403, "Invalid request origin")
    await rate_limit(session, "login-global", 60)
    await rate_limit(session, "login:" + str(request.client.host if request.client else "unknown"), 10, 300)
    user = await session.scalar(select(User).where(User.username == payload.username))
    try:
        await asyncio.to_thread(ph.verify, user.password_hash if user else DUMMY_HASH, payload.password)
    except (VerificationError, InvalidHashError):
        raise HTTPException(401, "Invalid credentials")
    if not user:
        raise HTTPException(401, "Invalid credentials")
    raw = token()
    csrf = token()
    session.add(
        LoginSession(
            user_id=user.id,
            token_hash=digest(raw),
            csrf_hash=digest(csrf),
            expires_at=now() + timedelta(hours=8),
        )
    )
    session.add(Audit(actor=user.id, action="LOGIN", details={}))
    await session.commit()
    response.set_cookie(
        "resolveai_session",
        raw,
        secure=settings().cookie_secure,
        httponly=True,
        samesite="strict",
        path=settings().cookie_path,
        max_age=28800,
    )
    return {"username": user.username, "csrf_token": csrf}


@app.get(API_BASE + "/auth/me")
async def me(request: Request, session: DB):
    actor = await owner(request, session)
    user = await session.get(User, actor)
    if user is None:
        raise HTTPException(401, "Administrator no longer exists")
    return {"username": user.username}


@app.post(API_BASE + "/auth/logout")
async def logout(request: Request, response: Response, session: DB):
    await owner(request, session)
    await session.execute(
        delete(LoginSession).where(
            LoginSession.token_hash == digest(request.cookies.get("resolveai_session", ""))
        )
    )
    await session.commit()
    response.delete_cookie("resolveai_session", path=settings().cookie_path)
    return {"status": "logged_out"}


@app.post("/incidents/validate")
async def validate(payload: IncidentCreate, request: Request, session: DB):
    await integration(request, session)
    return {"valid": True}


@app.get(API_BASE + "/applications")
async def applications(request: Request, session: DB):
    await owner(request, session)
    apps = list((await session.scalars(select(Application).order_by(Application.name).limit(100))).all())
    envs = list((await session.scalars(select(Environment).limit(500))).all())
    return [
        {
            **public(a, "id name slug"),
            "environments": [public(e, "id name") for e in envs if e.application_id == a.id],
        }
        for a in apps
    ]


@app.post(API_BASE + "/applications", status_code=201)
async def create_application(payload: AppCreate, request: Request, session: DB):
    actor = await owner(request, session)
    await rate_limit(session, "owner-create:" + actor, 30)
    obj = Application(**payload.model_dump())
    session.add(obj)
    await session.flush()
    session.add(Audit(actor=actor, action="APPLICATION_CREATED", details={"application_id": obj.id}))
    await session.commit()
    return public(obj, "id name slug")


@app.get(API_BASE + "/applications/{app_id}")
async def get_application(app_id: str, request: Request, session: DB):
    await owner(request, session)
    obj = await session.get(Application, app_id)
    if not obj:
        raise HTTPException(404, "Application not found")
    return public(obj, "id name slug")


@app.post(API_BASE + "/applications/{app_id}/environments", status_code=201)
async def create_environment(app_id: str, payload: EnvCreate, request: Request, session: DB):
    actor = await owner(request, session)
    if not await session.get(Application, app_id):
        raise HTTPException(404, "Application not found")
    obj = Environment(application_id=app_id, name=payload.name)
    session.add(obj)
    session.add(Audit(actor=actor, action="ENVIRONMENT_CREATED", details={"application_id": app_id}))
    await session.commit()
    return public(obj, "id name application_id")


@app.get(API_BASE + "/credentials")
async def credentials(request: Request, session: DB):
    await owner(request, session)
    return [
        public(x, "id name environment_id revoked expires_at")
        for x in (await session.scalars(select(Credential).limit(200))).all()
    ]


@app.post(API_BASE + "/credentials", status_code=201)
async def create_credential(payload: CredentialCreate, request: Request, session: DB):
    actor = await owner(request, session)
    if not await session.get(Environment, payload.environment_id):
        raise HTTPException(404, "Environment not found")
    raw = token()
    hook = token() if settings().connector_key else None
    obj = Credential(
        name=payload.name,
        environment_id=payload.environment_id,
        token_hash=digest(raw),
        webhook_secret=encrypt(hook) if hook else None,
        expires_at=now() + timedelta(days=payload.days),
    )
    session.add(obj)
    await session.flush()
    session.add(Audit(actor=actor, action="CREDENTIAL_CREATED", details={"credential_id": obj.id}))
    await session.commit()
    return {
        **public(obj, "id name environment_id expires_at"),
        "token": raw,
        "webhook_secret": hook,
        "scopes": ["incident:write", "incident:read"],
    }


@app.delete(API_BASE + "/credentials/{key_id}")
async def revoke(key_id: str, request: Request, session: DB):
    actor = await owner(request, session)
    obj = await session.get(Credential, key_id)
    if not obj:
        raise HTTPException(404, "Credential not found")
    obj.revoked = True
    obj.webhook_secret = None
    session.add(Audit(actor=actor, action="CREDENTIAL_REVOKED", details={"credential_id": key_id}))
    await session.commit()
    return {"revoked": True}


@app.post(API_BASE + "/events")
async def events(payload: IncidentCreate, request: Request, response: Response, session: DB):
    credential = await integration(request, session)
    obj, new = await ingest(session, credential, payload)
    response.status_code = 202 if new else 200
    return {"id": obj.id, "status": obj.status, "duplicate": not new}


@app.post(API_BASE + "/webhooks/{key_id}")
async def webhook(key_id: str, request: Request, response: Response, session: DB):
    if settings().demo_mode:
        raise HTTPException(403, "Public demo is read-only")
    await rate_limit(session, "webhook-global", 120)
    cred = await session.get(Credential, key_id)
    if not cred or cred.revoked or cred.expires_at <= now() or not cred.webhook_secret:
        raise HTTPException(401, "Invalid integration")
    await rate_limit(session, "webhook:" + key_id, 60)
    stamp = request.headers.get("x-resolveai-timestamp", "")
    if not stamp.isdigit() or abs(time.time() - int(stamp)) > 300:
        raise HTTPException(401, "Stale webhook timestamp")
    body = await request.body()
    expected = hmac.new(
        decrypt(cred.webhook_secret).encode(), stamp.encode() + b"." + body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("x-resolveai-signature", "")):
        raise HTTPException(401, "Invalid webhook signature")
    replay_key = digest(key_id + stamp + expected)
    if await session.get(WebhookReplay, replay_key):
        raise HTTPException(409, "Webhook replay rejected")
    try:
        payload = IncidentCreate.model_validate_json(body)
    except ValueError:
        raise HTTPException(422, "Invalid event")
    # Replay reservation and ingestion commit together; any failure rolls back both.
    session.add(WebhookReplay(key=replay_key, expires_at=now() + timedelta(minutes=10)))
    await session.flush()
    obj, new = await ingest(session, cred, payload)
    await session.commit()
    response.status_code = 202 if new else 200
    return {"id": obj.id, "status": obj.status}


async def scoped_incident(id, request, session):
    credential = await read_identity(request, session)
    obj = await session.get(Incident, id)
    if not obj or (
        credential and (obj.environment_id != credential.environment_id or obj.source_id != credential.id)
    ):
        raise HTTPException(404, "Incident not found")
    return obj


@app.get(API_BASE + "/incidents")
async def incidents(
    request: Request,
    session: DB,
    status: str | None = None,
    severity: str | None = None,
    environment_id: str | None = None,
    application_id: str | None = None,
    q: str = Query("", max_length=100),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
):
    credential = await read_identity(request, session)
    query = select(Incident)
    if credential:
        query = query.where(
            Incident.source_id == credential.id, Incident.environment_id == credential.environment_id
        )
    if status:
        query = query.where(Incident.status == status)
    if severity:
        query = query.where(Incident.severity == severity)
    if environment_id:
        query = query.where(Incident.environment_id == environment_id)
    if application_id:
        query = query.join(Environment).where(Environment.application_id == application_id)
    if q:
        query = query.where(Incident.service.ilike("%" + q + "%"))
    return [
        public(x, INC_FIELDS)
        for x in (
            await session.scalars(
                query.order_by(Incident.created_at.desc(), Incident.id).limit(limit).offset(offset)
            )
        ).all()
    ]


@app.get(API_BASE + "/incidents/{id}")
async def incident(id: str, request: Request, session: DB):
    obj = await scoped_incident(id, request, session)
    return public(obj, INC_FIELDS)


@app.get(API_BASE + "/incidents/{id}/timeline")
async def timeline(id: str, request: Request, session: DB):
    await scoped_incident(id, request, session)
    return [
        public(x, "id actor action details created_at")
        for x in (
            await session.scalars(
                select(Audit).where(Audit.incident_id == id).order_by(Audit.created_at).limit(300)
            )
        ).all()
    ]


@app.get(API_BASE + "/incidents/{id}/report")
async def report(id: str, request: Request, session: DB):
    obj = await scoped_incident(id, request, session)
    report = await session.scalar(select(Report).where(Report.incident_id == id))
    evidence = (
        await session.scalars(
            select(Evidence).where(Evidence.incident_id == id).order_by(Evidence.created_at).limit(100)
        )
    ).all()
    return {
        "status": obj.status,
        "report": report.data if report else None,
        "evidence": [public(e, "id source data observed_at") for e in evidence],
    }


@app.post(API_BASE + "/incidents/{id}/investigations", status_code=202)
async def retry(id: str, request: Request, session: DB):
    actor = await owner(request, session)
    await rate_limit(session, "retry:" + actor, 20)
    job = await session.scalar(select(Job).where(Job.incident_id == id).with_for_update())
    if not job:
        raise HTTPException(404, "Incident not found")
    if job.status in ("PENDING", "CLAIMED", "RETRY_SCHEDULED"):
        return {"status": job.status}
    job.status = "PENDING"
    job.attempts = 0
    job.version += 1
    job.next_attempt_at = now()
    job.error = None
    await session.execute(update(Incident).where(Incident.id == id).values(status="QUEUED"))
    session.add(Audit(incident_id=id, actor=actor, action="RETRY_REQUESTED", details={}))
    await session.commit()
    return {"status": "QUEUED"}


@app.patch(API_BASE + "/incidents/{id}/note")
async def note(id: str, payload: Note, request: Request, session: DB):
    actor = await owner(request, session)
    obj = await session.get(Incident, id)
    if not obj:
        raise HTTPException(404, "Incident not found")
    obj.note = redact(payload.note)
    session.add(Audit(incident_id=id, actor=actor, action="NOTE_UPDATED", details={}))
    await session.commit()
    return {"note": obj.note}


@app.get(API_BASE + "/connectors")
async def connectors(request: Request, session: DB):
    await owner(request, session)
    return [
        public(x, "id name environment_id kind host port database username tls enabled last_health")
        for x in (await session.scalars(select(Connector).limit(100))).all()
    ]


@app.post(API_BASE + "/connectors", status_code=201)
async def add_connector(payload: ConnectorCreate, request: Request, session: DB):
    actor = await owner(request, session)
    if not await session.get(Environment, payload.environment_id):
        raise HTTPException(404, "Environment not found")
    destination(payload.host, payload.port)
    if (
        await session.scalar(
            select(func.count())
            .select_from(Connector)
            .where(Connector.environment_id == payload.environment_id)
        )
        or 0
    ) >= 4:
        raise HTTPException(409, "Maximum four connectors per environment")
    data = payload.model_dump(exclude={"password"})
    data["secret"] = encrypt(payload.password)
    obj = Connector(**data)
    session.add(obj)
    await session.flush()
    session.add(Audit(actor=actor, action="CONNECTOR_REGISTERED", details={"connector_id": obj.id}))
    await session.commit()
    return public(obj, "id name kind enabled last_health")


@app.post(API_BASE + "/connectors/{id}/test")
async def test_connector(id: str, request: Request, session: DB):
    actor = await owner(request, session)
    await rate_limit(session, "connector-test:" + actor, 20)
    obj = await session.get(Connector, id)
    if not obj:
        raise HTTPException(404, "Connector not found")
    await session.commit()
    try:
        result = await execute(obj, "health", obj.environment_id)
        obj.last_health = "HEALTHY"
    except Exception:
        result = {"available": False, "message": "Connection unavailable or policy denied"}
        obj.last_health = "UNAVAILABLE"
    session.add(
        Audit(actor=actor, action="CONNECTOR_TESTED", details={"connector_id": id, "status": obj.last_health})
    )
    await session.commit()
    return {"status": obj.last_health, "result": result}


@app.delete(API_BASE + "/connectors/{id}")
async def disable_connector(id: str, request: Request, session: DB):
    actor = await owner(request, session)
    obj = await session.get(Connector, id)
    if not obj:
        raise HTTPException(404, "Connector not found")
    obj.enabled = False
    obj.secret = ""
    session.add(Audit(actor=actor, action="CONNECTOR_DISABLED", details={"connector_id": id}))
    await session.commit()
    return {"enabled": False}


@app.get(API_BASE + "/audit")
async def audit(request: Request, session: DB, limit: int = Query(100, ge=1, le=300)):
    await owner(request, session)
    return [
        public(x, "id incident_id actor action details created_at")
        for x in (await session.scalars(select(Audit).order_by(Audit.created_at.desc()).limit(limit))).all()
    ]


@app.get(API_BASE + "/operations")
async def operations(request: Request, session: DB):
    await owner(request, session)
    rows = (await session.execute(select(Job.status, func.count()).group_by(Job.status))).all()
    usage = await session.scalar(
        select(func.count())
        .select_from(Usage)
        .where(Usage.created_at >= now().replace(hour=0, minute=0, second=0, microsecond=0))
    )
    return {
        "jobs": dict(rows),
        "model_requests_today": usage,
        "daily_model_request_limit": settings().llm_daily_requests,
        "live_ai_enabled": settings().llm_enabled,
        "concurrency": 1,
        "maximum_attempts": 3,
    }


@app.get(API_BASE + "/demo/scenarios")
async def demo_list():
    return [{k: v for k, v in s.items() if k != "evidence"} for s in scenarios()]


@app.get(API_BASE + "/demo/scenarios/{slug}")
async def demo_scenario(slug: str):
    value = next((s for s in scenarios() if s["slug"] == slug), None)
    if not value:
        raise HTTPException(404, "Scenario not found")
    evidence = [
        {"id": f"{slug}-e{i + 1}", **e, "observed_at": "2026-01-15T12:00:00+00:00"}
        for i, e in enumerate(value["evidence"])
    ]
    result = recorded_report(evidence, value["error_rate"], value["service"])
    result["started_at"] = "2026-01-15T12:00:00+00:00"
    duration_seconds = int(value["duration"].split()[0])
    result["completed_at"] = (
        datetime.fromisoformat(result["started_at"]) + timedelta(seconds=duration_seconds)
    ).isoformat()
    return {
        **value,
        "mode": "fixture",
        "evidence": evidence,
        "report": result,
        "timeline": [
            {"action": a, "description": d, "offset": round(i * duration_seconds / 4)}
            for i, (a, d) in enumerate(
                [
                    ("Alert accepted", "Synthetic monitoring event validated."),
                    ("Severity assigned", "Deterministic policy evaluates the reported error rate."),
                    ("Evidence collected", "Allowlisted fixture metrics retain source references."),
                    ("Hypotheses checked", "Deterministic rules evaluate the supplied evidence."),
                    ("Report available", "Recommendations await human review. No action was executed."),
                ]
            )
        ],
    }


@app.get(API_BASE + "/demo/scenarios/{slug}/trace")
async def simulation_trace(slug: str):
    return read_simulation(slug)


@app.get(API_BASE + "/architecture")
async def architecture():
    return json.loads((ROOT / "architecture/index.json").read_text())


@app.get(API_BASE + "/architecture/{version}")
async def architecture_version(version: str):
    index = await architecture()
    if version not in [v["version"] for v in index["versions"]]:
        raise HTTPException(404, "Architecture version not found")
    return json.loads((ROOT / "architecture/versions" / f"{version}.json").read_text())


if (ROOT / "web/dist/assets").exists():
    app.mount("/assets", StaticFiles(directory=ROOT / "web/dist/assets"), name="assets")
    app.mount(
        "/projects/resolveai/app/assets",
        StaticFiles(directory=ROOT / "web/dist/assets"),
        name="prefixed-assets",
    )


@app.get("/projects/resolveai/app/resolveai-logo.png", include_in_schema=False)
@app.get("/resolveai-logo.png", include_in_schema=False)
async def logo():
    return FileResponse(ROOT / "web/public/resolveai-logo.png")


@app.get("/{path:path}", include_in_schema=False)
async def frontend(path: str):
    if path.startswith(("api/", "health/")):
        raise HTTPException(404, "Endpoint not found")
    file = ROOT / "web/dist/index.html"
    if not file.exists():
        raise HTTPException(503, "Build the frontend first")
    return FileResponse(file)
