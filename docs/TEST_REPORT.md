# Executed verification

Verification date: 2026-10-13. These are local results, not production-load or live-model claims.

| Check | Command / method | Result |
|---|---|---|
| Python style | `uv run ruff check app tests scripts alembic`; `uv run ruff format --check app tests scripts alembic` | PASS |
| Python types | `uv run mypy app` | PASS: 15 source files |
| Backend/security/evaluation suite | `uv run pytest -q --junitxml=docs/test-results.xml` | PASS: 45, zero failures/skips |
| Database schema | `uv run alembic upgrade head`; `uv run alembic check` | PASS: fresh PostgreSQL 18 database, revision 3c57cd3d805f, no drift |
| Frontend | `npm --prefix web run build` | PASS: TypeScript, all four Mermaid diagrams, production bundle |
| Python advisories | `uv run pip-audit` | PASS: no known dependency findings at scan time |
| Frontend advisories | `npm --prefix web audit` | PASS: zero findings after dependency override |
| Container advisories | Trivy 0.69.3 image scan, HIGH/CRITICAL | PASS: zero findings in the final Alpine-based runtime |
| Source/history hygiene | `uv run python scripts/scan_source.py`; Trivy secret scan of public source | PASS: no findings; scanners do not prove absence of secrets |
| Architecture | `uv run python scripts/architecture.py --check`; history gate | PASS: reviewed fingerprint, references, generated guide, immutable-history check |
| Private Compose | Dedicated QA project, real HTTP API and worker, restricted runtime role | PASS: bootstrap, application/environment/source, 202 acceptance, report, duplicate, revocation |
| Backup/recovery | Custom-format dump → fresh disposable DB; stop/restart only test DB | PASS: 1 incident, 1 report, 3 evidence rows restored; outage 503, recovery 200, rows retained |
| Browser | Codex browser automation against actual localhost app | PASS: public overview/scenarios/replay/report/export and architecture views; private login/setup/note flow; responsive checks |
| Public VPS/TLS | Target shared VPS | BLOCKED: root filesystem full; deployment not attempted |
| Live model evaluation | External provider | NOT RUN: no live provider enabled or billed |
| Extended load/soak, external penetration test | Not executed | NOT RUN; no reliability or independent-audit claim |

The suite covers scoped deduplication and conflicts, commit-before-202, competing claims, expired leases and stale fencing, retry exhaustion, authentication/CSRF/expiry/revocation, HMAC tamper/stale/replay, destination/operation denial, actual restricted PostgreSQL and Redis diagnostics, evidence citations, adversarial/ambiguous fixtures, body/rate/model budgets, missing model configuration, architecture routes, and dependency-outage readiness.

A recovery drill initially found that connection refusal returned 500. Readiness now handles that dependency failure as 503, with a regression test. Initial Mermaid sequence parsing and mobile navigation issues were corrected. The initial Debian runtime scan found inherited high/critical advisories; the final runtime was changed to an updated Alpine base and rescanned. Initial frontend advisories were resolved by the locked KaTeX override. Earlier failed attempts are retained outside the public source archive.

Browser checks covered widths 360, 390, 768, 1024, 1440 and 1920 with no overview document overflow. Report and architecture views were inspected at mobile and desktop sizes. This is browser smoke coverage, not a WCAG certification. Mermaid is lazily loaded; its large vendor chunks remain a build warning and a performance follow-up.

Receipts: [JUnit](test-results.xml), [summary](verification-summary.json), [container scan summary](container-scan.json), [recovery](recovery-results.json), [private Compose](private-compose-results.json), and genuine screenshots in assets/. Full private execution logs and database dumps are excluded from publication.
