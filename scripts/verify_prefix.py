"""Run with API_PREFIX=/api/projects/resolveai/v1 COOKIE_PATH=/api/projects/resolveai.
Creates a synthetic owner only in the isolated local test database, then removes it.
"""

import asyncio
import json
import secrets
from datetime import datetime, timezone
from pathlib import Path
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from app.main import app, API_BASE
from app.db.session import Session, engine
from app.core.security import ph
from app.core.config import settings
from app.models.incident import User, LoginSession, Audit, uid


async def main():
    assert ":55433/resolveai" in settings().database_url, "TEST ONLY"
    assert API_BASE == "/api/projects/resolveai/v1"
    cfg = settings()
    cfg.demo_mode = False
    cfg.cookie_secure = False
    cfg.public_origin = "http://prefix.test"
    ident = uid()
    password = secrets.token_urlsafe(24)
    username = "prefix-" + ident
    async with Session() as db:
        db.add(User(id=ident, username=username, password_hash=ph.hash(password)))
        await db.commit()
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://prefix.test",
            headers={"Origin": "http://prefix.test"},
        ) as client:
            response = await client.post(
                API_BASE + "/auth/login", json={"username": username, "password": password}
            )
            assert response.status_code == 200, response.text
            assert "Path=/api/projects/resolveai;" in response.headers["set-cookie"]
            client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
            assert (await client.get(API_BASE + "/auth/me")).status_code == 200
            spec = (await client.get(API_BASE + "/openapi.json")).json()
            assert API_BASE + "/events" in spec["paths"]
            assert "/api/v1/events" not in spec["paths"]
            assert (await client.get("/api/v1/config")).status_code == 404
            assert (await client.post(API_BASE + "/auth/logout", json={})).status_code == 200
            assert (await client.get(API_BASE + "/auth/me")).status_code == 401
            assert (await client.get("/projects/resolveai/app/architecture")).status_code == 200
            assert (await client.get("/projects/resolveai/app/resolveai-logo.png")).headers[
                "content-type"
            ] == "image/png"
        receipt = {
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "scope": "local private ASGI runtime and isolated test DB",
            "api_prefix": API_BASE,
            "cookie_path": cfg.cookie_path,
            "checks": [
                "login",
                "scoped cookie",
                "authenticated read",
                "OpenAPI prefix",
                "legacy API denied",
                "logout clears session",
                "deep link",
                "prefixed logo",
            ],
            "result": "PASS",
        }
        Path("docs/v4/prefix-private.json").write_text(json.dumps(receipt, indent=2) + "\n")
        print(json.dumps(receipt))
    finally:
        async with Session() as db:
            await db.execute(delete(LoginSession).where(LoginSession.user_id == ident))
            await db.execute(delete(Audit).where(Audit.actor == ident))
            await db.execute(delete(User).where(User.id == ident))
            await db.commit()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
