import hashlib
import hmac
import json
import re
import secrets
import time
from datetime import timedelta
from argon2 import PasswordHasher
from cryptography.fernet import Fernet
from fastapi import HTTPException, Request
from sqlalchemy import select, delete, case
from sqlalchemy.dialects.postgresql import insert
from app.core.config import settings
from app.models.incident import LoginSession, Credential, RateLimit, now

ph = PasswordHasher()
DUMMY_HASH = ph.hash(secrets.token_urlsafe(32))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def token():
    return secrets.token_urlsafe(32)


def encrypt(value):
    if not settings().connector_key:
        raise HTTPException(503, "Connector encryption key is not configured")
    return Fernet(settings().connector_key.encode()).encrypt(value.encode()).decode()


def decrypt(value):
    return Fernet(settings().connector_key.encode()).decrypt(value.encode()).decode()


def redact(value):
    text = json.dumps(value) if not isinstance(value, str) else value
    text = re.sub(
        r'(?i)("(?:password|api[_-]?key|token|secret)"\s*:\s*)"(?:\\.|[^"\\])*"',
        r'\1"[REDACTED]"',
        text,
    )
    text = re.sub(r"(?i)(bearer\s+)[\w.\-]+", r"\1[REDACTED]", text)
    text = re.sub(r'(?i)((?:password|api[_-]?key|token|secret)\s*[=:]\s*)[^\s,;"}]+', r"\1[REDACTED]", text)
    text = re.sub(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", "[EMAIL]", text)
    text = re.sub(r'\b(?:postgres(?:ql)?|redis|https?)://[^\s"<>]+', "[URL REDACTED]", text)
    text = re.sub(r"\bsk-[A-Za-z0-9_-]+", "[API KEY]", text)
    return text[:12000]


async def rate_limit(db, key, maximum, seconds=60):
    window = int(time.time()) // seconds * seconds
    stmt = insert(RateLimit).values(key=digest(key), window=window, count=1)
    returning_stmt = stmt.on_conflict_do_update(
        index_elements=["key"],
        set_={"window": window, "count": case((RateLimit.window == window, RateLimit.count + 1), else_=1)},
    ).returning(RateLimit.count)
    count = await db.scalar(returning_stmt)
    await db.commit()
    if count > maximum:
        raise HTTPException(429, "Request budget exceeded", headers={"Retry-After": str(seconds)})


async def owner(request: Request, db):
    if settings().demo_mode:
        raise HTTPException(403, "Public demo is read-only")
    raw = request.cookies.get("resolveai_session", "")
    session = await db.scalar(
        select(LoginSession).where(LoginSession.token_hash == digest(raw), LoginSession.expires_at > now())
    )
    if not session:
        raise HTTPException(401, "Administrator login required")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        csrf = request.headers.get("x-csrf-token", "")
        if not hmac.compare_digest(session.csrf_hash, digest(csrf)):
            raise HTTPException(403, "Invalid CSRF token")
        if request.headers.get("origin") != settings().public_origin:
            raise HTTPException(403, "Invalid request origin")
    return session.user_id


async def integration(request, db):
    if settings().demo_mode:
        raise HTTPException(403, "Public demo is read-only")
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Integration token required")
    cred = await db.scalar(
        select(Credential).where(
            Credential.token_hash == digest(auth[7:]),
            Credential.revoked.is_(False),
            Credential.expires_at > now(),
        )
    )
    if not cred:
        raise HTTPException(401, "Invalid integration token")
    await rate_limit(db, "integration:" + cred.id, 60)
    return cred


async def read_identity(request, db):
    if request.headers.get("authorization"):
        return await integration(request, db)
    await owner(request, db)
    return None


async def clean_sessions(db):
    await db.execute(delete(LoginSession).where(LoginSession.expires_at < now() - timedelta(days=1)))
