# API contracts

All private endpoints are under `/api/v1`. The public instance only exposes config, synthetic scenarios, architecture versions, and health checks. The private OpenAPI schema is available at `/api/v1/openapi.json` after administrator login.

## Source credentials and ingestion

Create an application, environment, and credential as administrator. The generated bearer token is disclosed once and bound to one environment and source. It can ingest and read its own incidents; it cannot configure the product. Default expiration is 90 days, configurable from 1–365 days.

```http
POST /api/v1/events
Authorization: Bearer DUMMY_TOKEN
Content-Type: application/json

{"event_id":"alert-001","service":"shop-api","error_rate":32,"message":"Synthetic database timeout","scenario":"postgres-saturation","mode":"fixture"}
```

New work returns 202 only after incident and job commit. An identical retry returns 200 with the same ID. Reusing the source/event ID with a different submitted payload returns 409. Event IDs are scoped to the source. Unknown fields, nonfinite percentages, blank identifiers, oversized messages, and timezone-free explicit timestamps are rejected. An omitted observed_at is assigned server time and excluded from the payload fingerprint so a retry remains stable.

Read `/incidents`, `/incidents/{id}`, `/incidents/{id}/timeline`, and `/incidents/{id}/report`. Lists accept limit (1–100), offset, service search, severity, status, application_id, and environment_id. An integration can only see its own source records. The owner can see the whole single-tenant workspace. Missing or inaccessible incident IDs return 404.

## Signed webhooks

POST the same event to `/api/v1/webhooks/{credential_id}`. Sign `timestamp + "." + raw_body` using HMAC-SHA256 and the separately revealed webhook signing secret. Send the hex signature in `X-ResolveAI-Signature` and Unix seconds in `X-ResolveAI-Timestamp`. Timestamp tolerance is 300 seconds. Exact signed replays return 409. Re-sign a retry with a new timestamp; event deduplication still applies. Webhook secrets require the external encryption key.

## Browser administration

The local CLI bootstraps one owner. Login uses a secure HttpOnly SameSite cookie. The JSON login result includes a CSRF token. Send it in `X-CSRF-Token` on state changes and use the configured origin. Logout deletes the stored session. No public registration exists. API tokens cannot replace owner sessions.

Admin routes manage applications and environments, credentials, connectors, notes, safe investigation retries, operations, and audit. A retry on an already active job is idempotent. Revocation takes effect on subsequent authentication. Connector DELETE disables it and clears its secret.

## Errors and limits

Errors contain code, message, and request_id; validation errors list field paths and types without echoing rejected values. Request bodies are capped at 32 KiB. Source ingestion has a 60/minute quota. Owner retry and connector tests have 20/minute quotas. Login has global and per-client limits. The public static proxy applies request rate and method restrictions. See the implementation for exact policy constants.

Health/live does not contact dependencies. Health/ready checks PostgreSQL with a two-second timeout in private mode; synthetic mode checks no private dependency. Report readiness does not imply operational resolution.

## Public simulation recordings

`GET /api/v1/demo/scenarios/{slug}/trace` returns a committed synthetic backend recording for an allowlisted scenario. It is read-only and never runs an investigation. The `/simulation` page executes an editable browser model locally; its Run button never posts edited data to `/api/v1/events`. See [SIMULATION_GUIDE.md](SIMULATION_GUIDE.md) for fidelity and exercises.
