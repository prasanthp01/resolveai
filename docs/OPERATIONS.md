# Operations and recovery

## Health and observation

Liveness reports process availability. Private readiness uses a bounded database query and returns 503 on a dependency outage; public synthetic readiness has no private database dependency. The owner operations endpoint reports job states and daily model request reservations. Structured request logs contain correlation ID, method, status, and duration without request bodies or credentials. Investigation audit events record acceptance, claims, safe tool summaries, report persistence, retries, and terminal failures.

Default private execution is one worker with a small PostgreSQL connection pool. Polling sleeps when idle. Connector, model, run, payload, list, and request budgets are bounded. Measure host usage before changing concurrency or setting resource limits. Configure proxy/application logs with rotation.

## Failure handling

Accepted incidents survive API or worker restarts because the job is committed with the incident. Expired claims are recoverable. Claim versions reject stale completions. Provider or workflow errors persist bounded retries; exhausted work remains DEAD_LETTER/NEEDS_REVIEW. Retrying investigation does not assert resolution of the underlying operational incident.

An unavailable connector can yield partial evidence. A missing model key returns a needs_configuration report. Investigate the visible state and safe error category; never paste credentials into logs or issue reports.

## Backup and restore

The static public demo is recoverable from its versioned export plus the proxy configuration and certificate management. Keep at least the previous export and its SHA-256 receipt. It has no user database to back up.

For private data, `scripts/backup.sh` runs pg_dump in custom format to a mode-700 directory using the maintenance identity. It does not claim encryption or off-host delivery: configure those separately, with an encrypted destination and retention policy appropriate to the deployment. Preserve CONNECTOR_KEY separately from the database backup. Losing that key makes stored connector secrets unusable.

A suggested private policy is daily encrypted backups, seven daily and four weekly copies, and a monthly disposable restore. Set the schedule in the host's normal operations system only after selecting an approved encrypted/off-host destination. No off-host provider or backup destination is silently configured by this project. A volume is not a backup.

To verify recovery, create a new disposable database, restore with pg_restore --exit-on-error, compare incident/report/evidence counts, and run a read/report smoke check. Never restore over an active production database for testing. The test report records the local disposable restore actually performed.

## Retention

`uv run python -m app.cli purge --days 30` removes old terminal incident records and related evidence/reports/runs/audit after a minimum seven-day retention. A new aggregate purge receipt is retained. It also expires sessions and webhook replay markers. Perform maintenance with an approved backup and the correct private database configuration. Do not run against another application's database.

## Rollback

Public static rollback switches the release symlink to a preserved prior export and reloads only when configuration changed. Container rollback uses a previously verified image digest. Database changes must be backward-compatible or use an explicitly reviewed migration plan; never blindly downgrade a data-destructive migration. The initial schema downgrade drops data and is suitable only for disposable test environments.

Known limitations: no certified tamper-proof audit storage, no off-host backup destination selected, no production load/soak guarantee, and no externally configured alerting service. Host disk and existing workloads must be healthy before deployment.
