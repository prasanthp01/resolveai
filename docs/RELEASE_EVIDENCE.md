# Release evidence

Application: **0.1.0 public beta**. Current architecture: **1.0.1**, with **1.0.0 retained unchanged**. Outcome: **FULL SUCCESS for the synthetic public beta delivery**.

- Public demo: https://portfolio.gappazappa.in
- Study guide: https://portfolio.gappazappa.in/architecture
- Source repository: https://github.com/prasanthp01/resolveai
- Deployed application source commit: `47841ee92be07a4d4dc5c9df68829ffd83f4752a`
- Public artifact SHA-256: `cb3ccb601ba24f0c28638dac46cbb03f1af8395971a169ae4cc3301dc1430284`
- Activation: `2026-10-13T07:41:19.809255+00:00`
- Initial hosted CI: https://github.com/prasanthp01/resolveai/actions/runs/38363333879 (passed). Final documentation commit/run and published release are recorded in the delivery manifest.

## Deployment

The public site serves a static export of the canonical synthetic scenario and architecture endpoints through the existing nginx proxy. No public Python API, database, worker, model credential, or live connector is deployed. This avoids adding background memory/CPU pressure to the constrained shared host. The private Compose profile was verified separately on disposable local services.

An explicitly approved disposable vulnerability-database cache was removed to recover space. Approximately 1.7 GiB remained free after deployment; this does not justify adding the private stack without another capacity review. Existing application containers were not recreated. A dedicated vhost and matching future Compose mount were added; the pre-existing main proxy file was restored byte-for-byte. Existing-site response checks matched their baseline.

TLS was issued for the public domain and expires 2027-01-11. The renewal timer is active, a domain-scoped reload hook is installed, and a simulated renewal passed. HTTP redirects to HTTPS. Public writes return 403, private API paths return 404, and security headers are present.

The public activation was safely rolled back to the preceding synthetic export and forward again. HTTPS architecture reads returned 1.0.1 → 1.0.0 → 1.0.1. Both snapshots remain accessible, and the prior clean export is retained. Staging archive restore compared all exported files byte-for-byte. Initial macOS archive metadata was excluded from the corrected artifact; that initial attempt is outside the web root.

## Local evidence

- 45 tests passed, zero failures/skips. Ruff, mypy, TypeScript/Vite, eight Mermaid diagram parses, migration consistency, source hygiene, and architecture consistency/history gates passed.
- PostgreSQL 18 and Redis diagnostics passed against isolated services with restricted credentials.
- Private Compose API → durable worker → report produced three evidence entries with no model call. Runtime uid is 10001; the database role has no superuser, createdb or createrole privilege.
- One idle local sample: API 69.7 MiB, worker 64.68 MiB, database 38.26 MiB; CPU 0.39%, 0.61%, 0.08%. These are local observations, not VPS load-test predictions.
- Dump/restore preserved one incident, one report and three evidence rows. A test-DB outage returned 503; restart returned 200 and retained data.
- Python/frontend dependency scans returned zero findings. The final container returned zero HIGH/CRITICAL Trivy findings at scan time. Image ID is in container-scan.json.
- Browser checks cover public scenarios, report export, replay, high/low diagrams, walkthroughs/history, version selection, private synthetic setup/report use, and six responsive widths. Screenshots are genuine captures.

## Limits

Owner manual acceptance and live-provider evaluation are NOT RUN. No paid model call, production traffic benchmark, independent security audit, externally configured alert service, encrypted off-host private backup, or playable demo video is claimed. The recording scripts and manual walkthrough are supplied. The public deployment has no mutable user database; its source and immutable export are backed up outside the VPS. Private backup encryption, off-host destination, schedule, and alert routing remain operator configuration for a future private deployment.

Receipts: deployment.json, public-smoke.json, public-recovery.json, recovery-results.json, private-compose-results.json, test-results.xml, container-scan.json, and verification-summary.json. Exact dependency versions are in lockfiles/inventories; migration revision is 3c57cd3d805f.
