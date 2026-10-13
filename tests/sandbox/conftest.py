import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.sandbox.main import create_app
from app.sandbox.runtime import RunStore


@pytest_asyncio.fixture(autouse=True)
async def clean_database():
    """Sandbox tests must remain independent of the private PostgreSQL runtime."""
    yield


@pytest_asyncio.fixture
async def sandbox():
    store = RunStore(checkpoint_seconds=0.001, deadline=0.15)
    app = create_app(store, origin="http://sandbox.test", secure=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://sandbox.test") as client:
        response = await client.get("/api/projects/resolveai/simulation/schema")
        client.headers.update(
            {"Origin": "http://sandbox.test", "X-CSRF-Token": response.headers["x-csrf-token"]}
        )
        yield client, store, app
    await store.close()
