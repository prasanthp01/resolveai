"""Public synthetic sandbox ASGI app. Run ONE worker; no private routes or DB imports."""

import asyncio
import hashlib
import hmac
import json
import os
import secrets
import time
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, Response, Query
from starlette.exceptions import HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse, RedirectResponse
from starlette.staticfiles import StaticFiles
from app.sandbox.contracts import (
    SimulationStart,
    SimulationInput,
    SimulationResult,
    RunState,
    PRESETS,
    MODE,
)
from app.sandbox.runtime import RunStore, SandboxError, TERMINAL
from app.version import APP_VERSION
from app.sandbox import wire

PREFIX = "/api/projects/resolveai"
COOKIE = "resolveai_sandbox"
ROOT = Path(__file__).resolve().parents[2]


class Limits:
    def __init__(self):
        self.buckets = {}

    def check(self, key, count, seconds=60):
        now = time.monotonic()
        if len(self.buckets) >= 2048:
            self.buckets = {k: v for k, v in self.buckets.items() if v and v[-1] > now - 60}
            if len(self.buckets) >= 2048 and key not in self.buckets:
                raise SandboxError("RATE_LIMIT", "Capacity reached. Retry later.", 429, True)
        values = self.buckets.setdefault(key, deque())
        while values and values[0] <= now - seconds:
            values.popleft()
        if len(values) >= count:
            raise SandboxError("RATE_LIMIT", "Request limit reached. Retry in 60 seconds.", 429, True)
        values.append(now)


def create_app(store=None, origin=None, secure=None):
    registry = store or RunStore()
    public_origin = origin or os.getenv("PUBLIC_ORIGIN", "http://localhost:8131")
    secure_cookie = secure if secure is not None else public_origin.startswith("https://")
    secret = secrets.token_bytes(32)  # Ephemeral identity intentionally expires on restart.
    limits = Limits()

    @asynccontextmanager
    async def lifespan(app):
        async def cleanup():
            while True:
                await asyncio.sleep(15)
                registry.cleanup()

        cleaner = asyncio.create_task(cleanup())
        yield
        cleaner.cancel()
        await asyncio.gather(cleaner, return_exceptions=True)
        await registry.close()

    app = FastAPI(
        title="ResolveAI synthetic simulation",
        version=APP_VERSION,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=PREFIX + "/openapi.json",
    )
    app.state.runs = registry
    app.state.limits = limits

    def sign(value):
        return hmac.new(secret, value.encode(), hashlib.sha256).hexdigest()

    def identity(request):
        value = request.cookies.get(COOKIE, "")
        try:
            sid, expires, signature = value.split(".")
            if (
                len(sid) != 32
                or not hmac.compare_digest(signature, sign(sid + "." + expires))
                or int(expires) < time.time()
            ):
                raise ValueError
            return sid, expires
        except (ValueError, TypeError):
            raise SandboxError("SESSION_REQUIRED", "Start a new anonymous session and retry.", 401)

    def write_identity(request):
        sid, expires = identity(request)
        if request.headers.get("origin") != public_origin or not hmac.compare_digest(
            request.headers.get("x-csrf-token", ""), sign(sid + ".csrf")
        ):
            raise SandboxError("ORIGIN_OR_CSRF", "Request origin or session token is invalid.", 403)
        return sid

    def failure(request, code, message, status, retryable=False, fields=None):
        if fields:
            message = (message + " " + "; ".join(f["field"] + ": " + f["message"] for f in fields))[:240]
        data = wire.error(
            code, message, status, getattr(request.state, "request_id", "unavailable"), retryable
        )
        return JSONResponse(
            data,
            status_code=data["http_status"],
            headers={"Retry-After": "60"} if data["http_status"] == 429 else None,
        )

    @app.middleware("http")
    async def guard(request, call_next):
        # Support the shared edge's prefix stripping as well as direct prefixed deployment.
        if (
            request.scope["path"].startswith(("/simulation/", "/simulations", "/v1/"))
            or request.scope["path"] == "/openapi.json"
        ):
            request.scope["path"] = PREFIX + request.scope["path"]
            request.scope["raw_path"] = request.scope["path"].encode()
        request.state.request_id = secrets.token_hex(12)
        try:
            if request.url.path != "/health/ready":
                limits.check("global", 900)
                # Do not trust caller-supplied forwarded IPs. Edge limits supplement this bound.
                limits.check("peer:" + (request.client.host if request.client else "unknown"), 600)
            if request.method not in ("GET", "HEAD", "OPTIONS"):
                total, parts = 0, []
                async with asyncio.timeout(5):
                    async for chunk in request.stream():
                        total += len(chunk)
                        if total > 16384:
                            raise SandboxError("PAYLOAD_TOO_LARGE", "Input exceeds 16 KiB.", 413)
                        parts.append(chunk)
                request._body = b"".join(parts)
                if request._body and not request.headers.get("content-type", "").startswith(
                    "application/json"
                ):
                    raise SandboxError("JSON_REQUIRED", "Send application/json.", 415)
            response = await call_next(request)
        except TimeoutError:
            response = failure(request, "REQUEST_TIMEOUT", "Request body deadline exceeded.", 408)
        except RecursionError:
            response = failure(
                request, "VALIDATION_ERROR", "JSON nesting exceeds the supported input structure.", 422
            )
        except SandboxError as exc:
            response = failure(request, exc.code, exc.message, exc.status, exc.retryable)
        except Exception:
            response = failure(request, "INTERNAL_ERROR", "Request failed safely.", 500)
        response.headers.update(
            {
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "X-Request-ID": request.state.request_id,
                "Referrer-Policy": "no-referrer",
                "Content-Security-Policy": (
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                    "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
                    "base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
                    if request.url.path.startswith("/projects/resolveai/app")
                    else "default-src 'none'; frame-ancestors 'none'"
                ),
            }
        )
        return response

    @app.exception_handler(SandboxError)
    async def sandbox_error(request, exc):
        return failure(request, exc.code, exc.message, exc.status, exc.retryable)

    @app.exception_handler(RequestValidationError)
    async def invalid(request, exc):
        return failure(
            request,
            "VALIDATION_ERROR",
            "Correct the marked input fields and try again.",
            422,
            fields=[
                {"field": ".".join(map(str, e["loc"])), "type": e["type"], "message": e["msg"]}
                for e in exc.errors()
            ],
        )

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return failure(request, "HTTP_ERROR", "Endpoint or request unavailable.", exc.status_code)

    @app.get("/health/ready")
    @app.get(PREFIX + "/health")
    async def health():
        return {
            "status": "ready",
            "app_version": APP_VERSION,
            "mode": MODE,
            "storage": "ephemeral",
            "database_required": False,
        }

    @app.get(PREFIX + "/simulation/session")
    async def session(request: Request, response: Response):
        limits.check("sessions", 60)
        try:
            sid, expires = identity(request)
        except SandboxError:
            sid, expires = secrets.token_hex(16), str(int(time.time()) + 1800)
        value = sid + "." + expires
        response.set_cookie(
            COOKIE,
            value + "." + sign(value),
            max_age=max(1, int(expires) - int(time.time())),
            httponly=True,
            secure=secure_cookie,
            samesite="strict",
            path=PREFIX,
        )
        return {
            "csrf_token": sign(sid + ".csrf"),
            "expires_at": int(expires),
            "run_ttl_seconds": registry.ttl,
        }

    @app.get(PREFIX + "/simulation/schema")
    async def schema(request: Request, response: Response):
        anonymous = await session(request, response)
        response.headers["X-CSRF-Token"] = anonymous["csrf_token"]
        input_schema = SimulationInput.model_json_schema()
        return {
            "schema_version": "1.0",
            "project_id": "resolveai",
            "input_schema_id": "resolveai-input-1.0",
            "input_schema_sha256": wire.digest(input_schema),
            "input_schema": input_schema,
            "supported_modes": [MODE],
            "limits": {
                "max_body_bytes": 16384,
                "max_run_seconds": max(1, int(registry.deadline)),
                "retention_seconds": int(registry.ttl),
                "max_concurrent_global": registry.max_active,
                "max_concurrent_per_session": registry.per_owner,
                "max_steps": 40,
            },
        }

    @app.get(PREFIX + "/simulation/presets")
    async def presets():
        return {
            "schema_version": "1.0",
            "project_id": "resolveai",
            "presets": [wire.preset(p) for p in PRESETS],
        }

    @app.post(PREFIX + "/simulations", status_code=202, response_model=RunState)
    async def start(payload: SimulationStart, request: Request, response: Response):
        sid = write_identity(request)
        limits.check("runs-global", 60)
        limits.check("runs:" + sid, 12)
        if payload.mode != MODE:
            raise SandboxError(
                "MODE_NOT_AVAILABLE", "Public execution supports deterministic synthetic runs only.", 403
            )
        if payload.preset_id and payload.preset_id not in {p["id"] for p in PRESETS}:
            raise SandboxError("UNKNOWN_PRESET", "Select a published preset or omit preset_id.", 422)
        run, duplicate = registry.start(payload, sid)
        response.status_code = 200 if duplicate else 202
        response.headers["Location"] = PREFIX + "/simulations/" + run.id
        return wire.state(run, registry.ttl, duplicate)

    @app.get(PREFIX + "/simulations/{run_id}", response_model=RunState)
    async def status(run_id: str, request: Request):
        sid, _ = identity(request)
        run = registry.get(run_id, sid)
        if run.status == "EXPIRED":
            raise SandboxError("RUN_EXPIRED", "Run expired; submit a new simulation.", 410)
        return wire.state(run, registry.ttl)

    @app.get(PREFIX + "/simulations/{run_id}/result", response_model=SimulationResult)
    async def result(run_id: str, request: Request):
        sid, _ = identity(request)
        run = registry.get(run_id, sid)
        if run.status == "EXPIRED":
            raise SandboxError("RUN_EXPIRED", "Run expired; submit a new simulation.", 410)
        if not run.result:
            raise SandboxError("RESULT_PENDING", "The investigation is still running.", 409, True)
        return wire.result(run)

    @app.post(PREFIX + "/simulations/{run_id}/cancel", response_model=RunState)
    async def cancel(run_id: str, request: Request):
        run = registry.get(run_id, write_identity(request))
        if run.task and run.status not in TERMINAL:
            run.task.cancel()
            await asyncio.gather(run.task, return_exceptions=True)
            # A task cancelled before its first scheduling turn has not entered execute().
            if run.status not in TERMINAL:
                run.finish("CANCELLED")
        return wire.state(run, registry.ttl)

    @app.get(PREFIX + "/simulations/{run_id}/events")
    async def events(run_id: str, request: Request, after: str | None = Query(default=None)):
        sid, expires = identity(request)
        run = registry.get(run_id, sid)
        if run.status == "EXPIRED":
            raise SandboxError("RUN_EXPIRED", "Run event log expired.", 410)
        last = request.headers.get("last-event-id")
        try:
            if (after is not None and not after.isdecimal()) or (last is not None and not last.isdecimal()):
                raise ValueError
            if after is not None and last is not None and int(after) != int(last):
                raise ValueError
            cursor_value = int(last if last is not None else after or "0")
            if not 0 <= cursor_value <= len(run.events):
                raise ValueError
        except ValueError:
            raise SandboxError(
                "INVALID_CURSOR",
                "Use an existing numeric sequence from this run; both cursors must agree.",
                409,
            )
        if "text/event-stream" not in request.headers.get("accept", ""):
            return {
                "schema_version": "1.0",
                "run_id": run.id,
                "events": [wire.event(e) for e in run.events if e["sequence"] > cursor_value],
                "terminal": run.status in TERMINAL,
                "next_sequence": len(run.events),
            }
        if sum(registry.streams.values()) >= 24 or registry.streams.get(sid, 0) >= 2:
            raise SandboxError("STREAM_LIMIT", "Too many event streams; use polling.", 429, True)
        registry.streams[sid] = registry.streams.get(sid, 0) + 1

        async def stream():
            cursor = cursor_value
            try:
                while time.time() < int(expires):
                    registry.cleanup()
                    for event in run.events:
                        if event["sequence"] > cursor:
                            yield f"id: {event['sequence']}\nevent: step\ndata: {json.dumps(wire.event(event))}\n\n"
                            cursor = event["sequence"]
                    if run.status in TERMINAL:
                        yield f"event: end\ndata: {json.dumps({'last_sequence': len(run.events)})}\n\n"
                        return
                    if await request.is_disconnected():
                        return
                    yield ": heartbeat\n\n"
                    await asyncio.sleep(0.1)
            finally:
                registry.streams[sid] -= 1
                if not registry.streams[sid]:
                    del registry.streams[sid]

        return StreamingResponse(
            stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"}
        )

    # Explicit read-only legacy resources for the optional prefixed full app and architecture study page.
    @app.get(PREFIX + "/v1/config")
    async def config():
        return {
            "demo": True,
            "version": APP_VERSION,
            "build_sha": os.getenv("BUILD_SHA", "development"),
            "live_ai_enabled": False,
        }

    @app.get(PREFIX + "/v1/architecture")
    async def architecture():
        return json.loads((ROOT / "architecture/index.json").read_text())

    @app.get(PREFIX + "/v1/architecture/{version}")
    async def architecture_version(version: str):
        index = await architecture()
        if version not in [v["version"] for v in index["versions"]]:
            raise SandboxError("VERSION_NOT_FOUND", "Architecture version unavailable.", 404)
        return json.loads((ROOT / "architecture/versions" / f"{version}.json").read_text())

    @app.get(PREFIX + "/v1/demo/scenarios")
    async def scenarios():
        return json.loads((ROOT / "demo/scenarios.json").read_text())

    @app.get(PREFIX + "/v1/demo/scenarios/{slug}/trace")
    async def trace(slug: str):
        if slug not in {item["slug"] for item in await scenarios()}:
            raise SandboxError("SCENARIO_NOT_FOUND", "Recorded scenario unavailable.", 404)
        return json.loads((ROOT / "demo/simulations" / f"{slug}.json").read_text())

    @app.get(PREFIX + "/v1/demo/scenarios/{slug}")
    async def scenario(slug: str):
        recorded = await trace(slug)
        item = next(value for value in await scenarios() if value["slug"] == slug)
        return {
            **item,
            "mode": "fixture",
            "evidence": recorded["evidence"],
            "report": recorded["analysis"]["report"],
            "timeline": [],
        }

    # Mount only compiled public assets. API paths never fall back to HTML.
    frontend = ROOT / "web/dist"
    if (frontend / "index.html").is_file():

        class StudioFiles(StaticFiles):
            async def get_response(self, path, scope):
                try:
                    return await super().get_response(path, scope)
                except HTTPException as exc:
                    if exc.status_code == 404 and path in {
                        "",
                        "studio",
                        "architecture",
                        "simulation",
                        "incidents",
                        "integrations",
                        "operations",
                        "login",
                    }:
                        return await super().get_response("index.html", scope)
                    raise

        @app.get("/", include_in_schema=False)
        @app.get("/projects/resolveai", include_in_schema=False)
        async def studio_redirect():
            return RedirectResponse("/projects/resolveai/app/studio", status_code=307)

        app.mount("/projects/resolveai/app", StudioFiles(directory=frontend, html=True))

    wire.install_openapi(app, PREFIX)
    return app


app = create_app()
