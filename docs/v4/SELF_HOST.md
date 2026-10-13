# Run the ResolveAI server-side sandbox

The default public experience is deterministic and synthetic. It needs no provider key, PostgreSQL, Redis or external service. Private connectors are a separate runtime.

## Local development

From the repository root, install locked dependencies with `uv sync --frozen --python 3.12` and `npm --prefix web ci --ignore-scripts`. Start the sandbox:

```sh
PUBLIC_ORIGIN=http://127.0.0.1:5179 uv run uvicorn app.sandbox.main:app --host 127.0.0.1 --port 8131 --workers 1
```

In a second terminal, run `npm --prefix web run dev`. Open `http://127.0.0.1:5179/projects/resolveai`. Use that exact origin: localhost and 127.0.0.1 are different origins for CSRF checks.

The case study at this local route is a reference implementation. The shared deployed case study is owned by Portfolio. The standalone project preview is `/projects/resolveai/app/studio`; architecture is `/projects/resolveai/app/architecture`.

## Container profile

The quick start builds and serves both the studio and its API from the same loopback origin:

```sh
docker compose -f deploy/compose.sandbox.yaml up --build -d --wait
```

Open `http://127.0.0.1:8132/projects/resolveai/app/studio`. Set `RESOLVEAI_SANDBOX_PORT` to use a different local port; the default origin follows it. For HTTPS, explicitly set `PUBLIC_ORIGIN=https://demo.example.com` and place a TLS-terminating reverse proxy in front of the loopback service. Preserve the Host/Origin, disable event-stream buffering, limit requests at the edge and do not expose private APIs through this service.

The container has no private volume, a read-only filesystem, no added capabilities, a 192 MiB memory limit and a 0.35 CPU limit. One API process owns bounded in-memory runs and sessions. Restart invalidates both. Do not increase workers or replicas without coordinated storage. The ingress bridge enables the loopback published port; application code makes no external requests.

## Public API protocol

1. GET `/api/projects/resolveai/simulation/schema`. Retain the HttpOnly session cookie and `X-CSRF-Token` response header.
2. GET `/api/projects/resolveai/simulation/presets`. Response contains `schema_version`, `project_id`, and a `presets` array with `preset_id`, `title`, `description`, `input`, `seed`.
3. POST `/api/projects/resolveai/simulations` with the cookie, matching Origin, X-CSRF-Token and JSON `{schema_version:"1.0", project_id:"resolveai", mode:"SANDBOX_DETERMINISTIC", preset_id, input, seed, client_correlation_id}`.
4. GET `/simulations/{run_id}` for state. All run URLs remain under the same API prefix and require the session cookie.
5. GET `/simulations/{run_id}/events` with `Accept: text/event-stream` for named `step` messages. SSE IDs are numeric sequences. Send Last-Event-ID to reconnect; if also using `after`, both must agree. Terminal message is named `end` with last_sequence.
6. Use `Accept: application/json` and `?after=N` for polling. An impossible cursor is rejected. Reconcile events by sequence and reject conflicting duplicates.
7. GET `/simulations/{run_id}/result` when terminal. POST `/simulations/{run_id}/cancel` with cookie/origin/CSRF to cancel.

A repeated session-scoped client correlation ID and identical input returns 200 with the original run. Changed input returns 409. A lost start response can therefore be retried deliberately using the same request key. The UI does not automatically retry a POST.

JSON input is limited to 16 KiB and five seconds of body read time. Active run timeout is four seconds. Maximum 40 events per run, eight active runs globally, two per session, 256 retained runs, two streams per session and 24 streams globally. Admission is rate-limited globally and by session. Edge limits should add client-IP fairness; forwarded IP headers are not trusted by the application. Runs expire after ten minutes, sessions after thirty. Restart invalidates both.

## Private runtime and AI

Existing private setup remains documented in `docs/DEPLOYMENT.md`. For a staged private prefix, set `API_PREFIX=/api/projects/resolveai/v1` and `COOKIE_PATH=/api/projects/resolveai`. Forward that private path unchanged to the private API only in an explicitly authenticated deployment; never replace the synthetic public backend with a private one inadvertently.

`LLM_PROVIDER=openai_compatible` retains the private, operator-configured adapter and its database-backed daily request reservation. `LLM_BASE_URL` must be HTTPS. No new provider credentials are included or requested by the public UI.

`LLM_PROVIDER=agentops` uses `AGENTOPS_URL`, `AGENTOPS_TOKEN` and a pinned policy version. The currently observed gateway offers synthetic routing only, so live incident inference fails closed and the worker produces deterministic findings for human review. Direct billable fallback is disabled when central quotas cannot be enforced. No live-provider validation or cost claim is made.

## Verification

```sh
uv run pytest tests/sandbox -q
npm --prefix web run studio
uv run python -m scripts.verify_sandbox
uv run python scripts/architecture.py --check
```

The full existing pipeline test suite requires the dedicated local test PostgreSQL and Redis services. Test-only restore/prefix scripts refuse databases outside the known loopback test address. Never point them at production.

The pinned shared contract release is 1.0.0 (wire 1.0); see `contracts/ADOPTION.md`. Public routes also accept edge-stripped internal paths. Canonical evidence is a reference/hash ledger; complete synthetic diagnostics and per-stage details are in result.output.evidence_ledger and result.output.step_details. Expired run/status/event reads return 410. Local development without a valid BUILD_SHA uses an all-zero source_revision marker, meaning unverified source, not a real commit.

