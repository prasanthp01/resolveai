# Release evidence

Application candidate: **0.1.0**. Architecture snapshot: **1.0.0**. Status: **CODE COMPLETE, DEPLOYMENT BLOCKED**.

The configured public domain is portfolio.gappazappa.in. **NOT DEPLOYED:** the target VPS root filesystem was at 100% usage, with approximately 29 MiB free. SSH and DNS prerequisites were present; no ResolveAI files, proxy changes, certificate requests, or services were applied to that host. A narrowly scoped disposable scanner-cache cleanup was proposed to the owner. No unrelated application, image, volume, database, or backup was removed.

## Local evidence

- `pytest`: 45 passed, zero failures/skips; JUnit receipt retained.
- Ruff, mypy, TypeScript/Vite, Mermaid syntax, migration consistency, and architecture/source gates passed.
- Real PostgreSQL 18 and Redis diagnostics passed against isolated services with restricted credentials.
- Private Compose API → durable worker → report completed with three evidence entries and no model call.
- Private API/worker use uid 10001. Runtime database role has no superuser, createdb or createrole privilege.
- One idle local sample: API 69.7 MiB, worker 64.68 MiB, database 38.26 MiB; CPU 0.39%, 0.61%, 0.08% respectively. These are local observations, not VPS capacity or load-test predictions.
- Dump/restore preserved one incident, one report and three evidence rows. Test-DB outage returned 503; restart returned 200 and retained data.
- Final dependency scans returned zero Python/frontend advisory findings; final Alpine runtime returned zero HIGH/CRITICAL Trivy findings.
- Browser checks and genuine screenshots cover desktop/mobile, public learning flow, and private synthetic setup/report use.

Exact package versions are in the lockfiles and dependency inventories. The migration is 3c57cd3d805f. Architecture metadata names the implementation commit; the final repository commit and source/archive hashes are recorded in the delivery manifest outside this repository to avoid a circular hash.

## Not claimed

No verified public HTTPS deployment, released v0.1.0 tag, owner acceptance, live-provider benchmark, production workload measurement, externally configured alert service, encrypted off-host backup, or playable demo recording is claimed. The demo recording scripts and manual acceptance walkthrough are supplied.
