# Architecture decisions

## ADR 001 — Preserve the starter in an isolated repository

The supplied folder had no repository of its own; Git resolved to an unrelated parent. Preserve the starter as the first commit and extend a dedicated working copy. Do not stage the parent directory or copy private configuration. The original folder stays recoverable.

## ADR 002 — PostgreSQL durable jobs

Commit accepted incident and work marker together. Use atomic SKIP LOCKED claims, leases, heartbeats, and fencing. Redis remains a diagnostic integration, not a required queue. This limits infrastructure and gives the owner one consistency model to study.

## ADR 003 — Explicit workflow without LangGraph

The current investigation has a small linear set of stages. Durable state already exists in jobs/runs. Adding LangGraph would duplicate persistence without demonstrated benefit. Reconsider for branching or durable human checkpoints.

## ADR 004 — Public static synthetic export

The public VPS is resource constrained and already hosts other applications. Generate the public scenario and architecture JSON from the same canonical backend functions and ship it with the SPA. Existing nginx serves only these immutable assets. No public worker, database, live connector, or paid model call is required. Keep an equivalent container demo and full private Compose profile for self-hosting.

## ADR 005 — Explicit IP connector destinations

Accept only administrator-approved IPs in configured allowlists. Disable DNS destinations to avoid rebinding complexity. Require valid IP TLS certificates by default. Hostname support is a future feature with its own connection-pinning design.

## ADR 006 — Local port allocation

The suggested host port 5433 is occupied by an unrelated database. Use 55433 for the isolated ResolveAI development/test database, 55434 for disposable PostgreSQL diagnostics, and 55435 for disposable Redis. Container-internal PostgreSQL remains 5432. Do not change other listeners.

## ADR 007 — Versioned architecture as a product feature

Canonical JSON snapshots drive `/architecture`, the version API, and generated Markdown. Retain published snapshots, link source commit/app version, and fail consistency checks on source drift. The check detects missing maintenance but cannot establish prose accuracy without review.
