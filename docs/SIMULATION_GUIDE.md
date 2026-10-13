# Current server-side incident studio (application 0.3.0)

Open the standalone `/projects/resolveai/app/studio` preview or the integrated Portfolio case study. Start with Payment outage; press Run investigation. Plain language explains each stage; Technical details shows structured input/output, measured timing, deterministic rules and provenance. Export JSON retains the complete run result.

Study exercise: run the payment preset, open Database, change connections from 96 to 20 and run again. The connection-pressure hypothesis disappears; severity remains critical because the alert error rate remains 62%. Compare with the prior result. Then set error rate to 120: validation rejects it with a field error and preserves the editor. Reset and select connector timeout to see a partial-evidence report; select workflow timeout to see a failed run with retained evidence. No production action or paid inference happens.

Six presets cover payment outage, slow-query saturation, Redis pressure, release regression, upstream rate limiting, and insufficient evidence. Logs are allowlisted synthetic fixtures, including a quarantined instruction attempt. Unexpected URLs, SQL, keys and credentials are rejected as unknown fields.

See [SELF_HOST.md](v4/SELF_HOST.md) for the actual API/session protocol, [architecture](ARCHITECTURE.md) for high/low design, and handoff (historical receipt; not distributed) for release status.

---

The following describes the retained **historical v0.2 browser-only implementation**, not the current server-side studio. It remains useful when studying old releases and recorded backend comparisons.

# ResolveAI simulation lab — application 0.2.0

Open `/simulation`. Edit the JSON, select authentication or a worker fault, and press **Run simulation**. Use **Next stage** or the stage list to inspect the journey. **Non-technical**, **Technical**, and **Both** change the explanation without changing the result.

The public lab runs in the browser with synthetic evidence. Edited input is never posted to the API, no SQL or worker runs in the browser, and no external connector or model is called. Its incident memory lasts only in the current page and clears on refresh. The existing public server remains read-only.

## First successful investigation

1. Choose **Payment API connection saturation** and keep the initial sample.
2. Run it. Intake is modeled as HTTP 202: the private backend would first commit an incident, a job and an audit entry together.
3. Inspect the claim: the job becomes CLAIMED, the incident becomes INVESTIGATING, and a worker has a 60-second lease and a version used to reject stale writes.
4. Inspect the evidence: 96 of 100 database connections are occupied, 31 requests are waiting, and application telemetry contains 84 database timeouts. These are fixture observations, not live measurements.
5. Inspect the explanation: connection utilization meets the deterministic 85% threshold. The hypothesis cites its evidence. Correlation does not prove the root cause.
6. Read the final result. Incident REPORT_READY, job SUCCEEDED and run COMPLETED mean a report exists. They do not mean the service is repaired.

**Non-technical result:** The payment service reports failures on 32% of requests. Heavy database connection use is a plausible contributor. The affected user count is unknown. An operator should compare the incident window with independent application measurements before changing the service.

**Technical result:** The report response contains `status`, `report`, and `evidence`. The report includes HIGH severity, a `Database connection pressure` hypothesis, its evidence IDs, impact, uncertainty, recommended next steps, fixture mode and timestamps. Export the report or full stage trace to inspect the JSON.

## Exercises and expected outcomes

| Try this | Expected behavior | What to study |
| --- | --- | --- |
| Run the same accepted body twice | HTTP 200, same incident, duplicate=true | Source-scoped idempotency; no second job |
| Keep event_id and change message | HTTP 409 | A reused identifier cannot silently replace different content |
| Press Error rate = 101 | HTTP 422, body.error_rate | Validation happens before persistence |
| Press Broken JSON | HTTP 422, json_invalid | Syntax errors stop request processing |
| Select Missing credential | HTTP 401 for a valid body | Integration authentication |
| Add an unknown JSON field | HTTP 422, extra_forbidden | Strict event contract |
| Change error_rate to 75 with a new event ID | CRITICAL severity | Reported impact changes; fixed fixture evidence does not |
| Choose No evidence scenario | NEEDS_REVIEW, empty hypotheses | An incomplete report is preferable to an invented cause |
| Choose Timeout on all 3 attempts, then a new event ID | RETRY_SCHEDULED twice, then DEAD_LETTER; no report | Bounded retries and human review |
| Choose Expired lease, then a new event ID | Claim version increments; stale worker cannot save; replacement succeeds | Lease recovery and fencing |
| Choose Unsupported evidence citation, then a new event ID | ValueError, retries exhausted, no report | Reports cannot cite evidence that was not collected |
| Set mode to live | Explicit lab restriction, not a modeled HTTP response | Live mode belongs to a separately configured private deployment |

Fault controls are test conditions, not fields accepted by the event API. After changing a fault, use **New event ID**; otherwise normal deduplication correctly returns the previous result. Editing inputs does not change a previous result until Run is pressed again.

## Model fidelity and boundaries

The browser models common validation, severity, redaction, deduplication and job transitions. Hypotheses come from the chosen scenario's backend-generated deterministic report; browser-generated IDs are remapped to its evidence. Free-text messages are not analyzed by a live model. Input error rates can differ from the fixed evidence metrics, just as an alert and a separate observation can disagree; the lab does not invent new telemetry to make them agree.

The browser is a teaching model, not a second authoritative API. It does not model network transport, real authentication, concurrent SQL transactions, quotas, connector policies or model-provider behavior. The editor accepts ISO timestamps with a timezone; the private Pydantic contract supports additional datetime formats. Some field error type labels and JSON syntax locations are summarized in the lab. Replay steps and generated timestamps are not latency measurements.

The expandable backend verification section provides **separate recorded results**, captured from the actual FastAPI handlers via ASGITransport and an isolated PostgreSQL database. Worker claim/gather/complete functions were called individually so their state could be observed. These captures cover all four fixture scenarios, real successful/duplicate/conflicting/invalid/unauthenticated requests, citation rejection and a deliberately expired lease. They are not evidence that a user's edited browser request executed on a server.

## Keeping the page and recordings current

- UI: `web/src/Simulation.tsx`; executable browser model: `web/src/simulationEngine.ts`.
- Verified data: `demo/simulations/*.json`; read-only endpoint: `GET /api/v1/demo/scenarios/{slug}/trace`.
- Capture: provision and migrate a fresh, empty localhost:55433 database named `resolveai_simulation_*`, set its DATABASE_URL, and run `.venv/bin/python scripts/capture_simulations.py NEW_OUTPUT_DIRECTORY`. The script refuses a non-local/wrongly named/non-empty database and an existing destination; it does not delete data. Review the output before replacing committed recordings.
- `tests/test_simulations.py` checks the recordings' backend fingerprint, report citations, states and public read-only guards. Backend changes require a fresh capture. `web/scripts/check-simulation.mjs` compares the browser model with those records and checks validation and fault paths during every frontend build.
- Architecture 1.1.0 documents this flow and preserves 1.0.0 and 1.0.1. Any future behavior change must pass the architecture consistency/history checks and receive a new reviewed snapshot.
