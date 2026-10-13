import secrets
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import delete
from app.main import app
from app.db.session import Session
from app.db.base import Base
from app.core.config import settings
from app.core.security import ph
from app.models.incident import User


@pytest_asyncio.fixture(autouse=True)
async def clean_database():
    assert ":55433/resolveai" in settings().database_url or "resolveai_test" in settings().database_url, (
        "Refuse non-test database"
    )
    settings().demo_mode = False
    async with Session() as db:
        for table in reversed(Base.metadata.sorted_tables):
            await db.execute(delete(table))
        await db.commit()
    yield
    settings().demo_mode = False


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost:8130") as c:
        yield c


@pytest_asyncio.fixture
async def owner_client(client):
    password = secrets.token_urlsafe(24)
    async with Session() as db:
        db.add(User(username="owner", password_hash=ph.hash(password)))
        await db.commit()
    client.headers["Origin"] = "http://localhost:8130"
    response = await client.post("/api/v1/auth/login", json={"username": "owner", "password": password})
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    return client


@pytest_asyncio.fixture
async def context(owner_client):
    app = (
        await owner_client.post(
            "/api/v1/applications", json={"name": "Synthetic shop", "slug": "synthetic-shop"}
        )
    ).json()
    env = (
        await owner_client.post(f"/api/v1/applications/{app['id']}/environments", json={"name": "staging"})
    ).json()
    credential = (
        await owner_client.post(
            "/api/v1/credentials", json={"name": "test-source", "environment_id": env["id"]}
        )
    ).json()
    return {"application": app, "environment": env, "credential": credential, "client": owner_client}
