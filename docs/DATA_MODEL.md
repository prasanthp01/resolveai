# Data model and migrations

The canonical ER diagram and detailed explanations live in ARCHITECTURE.md and `/architecture?view=low`. Models are in `app/models/incident.py`; the initial explicit Alembic migration is in `alembic/versions/`.

| Entity | Ownership / invariant |
|---|---|
| users, sessions | One initial owner; hashed password and session tokens; expiration |
| applications, environments | Environment belongs to an application; unique application/name |
| integration_credentials | Environment-bound; token hash; encrypted optional webhook secret; expiry/revocation |
| connectors | Environment-bound; allowed kind; encrypted secret; enabled/health state |
| incidents | Unique source/event; normalized severity; separate investigation state |
| jobs | One logical job per incident; persisted attempts, lease, version, schedule |
| investigation_runs | Unique incident/claim version; historical attempt state |
| evidence_items | Observation source and timestamp; references an incident and run |
| reports | One current report per incident; linked to the producing run |
| audit_events | Application writes append-only events; maintenance may purge expired incident history |
| model_usage | Call reservations and reported token usage; no invented monetary estimate |
| rate_limits, webhook_replays | Persistent request counters and expiring replay identities |

IDs are UUID strings; timestamps are timezone-aware UTC. Foreign keys enforce entity existence. A source credential determines the event environment. Indexes support environment/status/time incident lists and scheduled job selection. No database row-level security is claimed: v0.1 uses one owner and backend source/environment authorization.

## Migration procedure

Back up nonempty databases first. Use `uv run alembic upgrade head` and `uv run alembic check`. Never reset an existing database to make migrations pass. The supplied starter contained an early globally unique event_id model; this run preserves that source in Git and uses a new isolated database. Adopting an unrelated pre-existing database requires a separate inspected data migration. Do not apply this initial migration blindly to an unmanaged schema.

The production private profile separates the migration identity from the runtime DML identity. The local test profile uses a dedicated disposable database owner for migration tests. Application append-only audit behavior is not a tamper-proof external ledger; a database administrator can modify stored history.
