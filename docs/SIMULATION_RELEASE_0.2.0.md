# Simulation release 0.2.0 — verification evidence

Status: **DEPLOYED AND VERIFIED** on 2026-10-13. Public page: https://portfolio.gappazappa.in/simulation. Architecture: **1.1.0**, with 1.0.0 and 1.0.1 preserved. The deployment remains synthetic static content; edited requests execute only in the browser.

Implementation commit: `0b0e32acada6dd7112158af2e1c39fddb13244f5`. Deployed source commit including the architecture snapshot: `621d99e1d2072e0451868529930c86f13199fa22`. Documentation/evidence commits after that do not change the deployed application.

| Check | Result | Evidence |
| --- | --- | --- |
| Backend suite | PASS | 50 tests passed in 3.00 seconds |
| Concurrent duplicate regression | PASS | Initial full run exposed a rollback/expired-credential reload error. Source identity is now retained before rollback; five additional isolated runs of the previously failing test passed |
| Actual pipeline recordings | PASS | Four new synthetic runs via FastAPI ASGITransport and isolated PostgreSQL; individually invoked worker stages; accepted, duplicate, conflict, invalid, missing-auth, citation rejection and lease recovery observations |
| Browser model contract | PASS | 165 assertions during frontend build, including comparison with all four captured backend reports |
| Ruff lint/format and mypy | PASS | 28 Python files formatted; 17 app source files type checked |
| Database schema | PASS | Alembic check found no new upgrade operations |
| Frozen dependencies | PASS | uv lock offline check; frontend/container build from lockfiles |
| Frontend production build | PASS | TypeScript, contract checks, all 12 versioned Mermaid diagrams and Vite build |
| Architecture consistency/history | PASS | Fingerprint, code references and generated Markdown agree; both prior snapshots unchanged |
| Source/history hygiene | PASS | Known credential patterns and private path scan; no findings |
| Container packaging | PASS | resolveai:0.2.0 built successfully; image manifest list digest 3a287c4d798681031f62072b56a6f2d6d2497ab2c04230f52c76302c9408cd58 |
| Browser functional checks | PASS | Editable JSON, successful output, duplicate 200, changed-body 409, invalid rate and JSON 422, missing authentication 401, missing evidence, timeout exhaustion, citation rejection and stale lease recovery |
| Audience views and export | PASS | Non-technical, Technical and Both views; downloaded JSON parsed with REPORT_READY/HIGH and three evidence rows |
| Responsive checks | PASS | Requested widths 360, 390, 768, 1024 and 1440; no document overflow. Mobile technical output visually inspected |
| Architecture browser | PASS | 1.1.0 selected, two low-level diagrams rendered, no error alerts |
| Public HTTPS checks | PASS | 17 route/method checks, security headers, current/old architecture versions, all trace endpoints, private GET 404 and public POST 403; see simulation-public-checks-v0.2.0.json |
| Public browser smoke | PASS | Edited service and error rate 75 reflected in output with CRITICAL severity; separate verified backend recording loaded |
| Neighboring applications | PASS | Existing POS returned 200; main site returned its existing 301 |
| Live-model evaluation / external load / independent security audit | NOT RUN | This delivery is a synthetic learning lab; no claims are made for these evaluations |
| Hosted CI for these new commits | NOT RUN | New commits retained locally, as requested |
| Owner acceptance | NOT RUN | Automated and browser verification are not owner acceptance |

The static archive SHA-256 is `e9553f8b951a28d59721b801bec2f729535684434386dd42f72934efe426a421`. It was activated by an atomic symlink switch at 2026-10-13T09:19:49Z. No proxy recreation or new VPS application services were required. The prior v0.1.0 release is retained as the rollback target. The activation script restores it automatically if its new-version probes fail; a separate v0.2.0 rollback round trip was NOT RUN.

Historical screenshot omitted from the source release.

Historical screenshot omitted from the source release.

See [SIMULATION_GUIDE.md](SIMULATION_GUIDE.md) for exercises, actual report meaning, API mapping, fidelity limits and the refresh workflow. The verified backend recordings are distinct from generated browser traces; neither claims to be production telemetry or a performance benchmark.
