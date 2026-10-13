# v4 verification scope

The public attacker is an anonymous visitor with control of request bodies, timing, cookie/header strings and run IDs. Critical boundaries are the signed anonymous session, CSRF/origin, strict input schema, bounded admission, run ownership, synthetic adapter capability set and separate deployment network.

Automated tests cover invalid percentages/types/physical bounds, unknown fields and destinations, injected fixture selection, oversized/nested JSON, missing/forged session and CSRF, cross-session reads/cancellation, duplicate and conflicting request keys, expired state, restart, event replay/cursor validation, stream/concurrency/rate limits, partial diagnostics, controlled provider failures, deadline, cancellation, and no private routes. The frontend event test rejects out-of-order conflicts and wrong run/mode while reconciling legitimate duplicates.

Eight held-out synthetic boundary cases live in `tests/sandbox/held_out.json`. Expected labels are consumed only by tests, never passed to the investigator. Six preset tests cover reproducibility and evidence references. These are rule-policy correctness checks, not evidence of production diagnostic accuracy or model quality.

Existing private tests exercise authenticated scoped ingestion, concurrent duplicates, real local PostgreSQL/Redis diagnostics, secret redaction, worker leases/fencing/retry and provider failure handling. The new AgentOps boundary tests demonstrate fail-closed behavior for denied scope, outage, policy mismatch, unavailable live models, and central-quota limitations. No real provider was called.

The benchmark records 24 local ASGI runs at concurrency four, with explicit checkpoint pacing. It reports process CPU, peak memory, p50/p95 and throughput with environment metadata. It is not a shared-VPS capacity or production availability claim. Public simulation incurs no external model spend; hosting is not free and is not measured per run.

Browser checks cover editable input, changed findings, validation preservation, controlled connector failure, technical details and viewport widths 320/375/430/768/1280/1440. Screenshots and dimensions are retained under `docs/v4/`. Full independent penetration testing, accessibility certification, live paid-model evaluation and owner acceptance are not claimed.
