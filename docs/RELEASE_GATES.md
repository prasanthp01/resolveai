# Release gates

Current outcome: **CODE COMPLETE, DEPLOYMENT BLOCKED**. The source candidate can be reviewed and installed locally. It is not a verified public release.

| Gate | Status | Evidence / consequence |
|---|---|---|
| Original work preserved | PASS | Recoverable starter commit and separate source backup; original checkout/database untouched |
| Core P0 implementation and local checks | PASS | TEST_REPORT.md and 45-test JUnit receipt |
| Actual restricted database/cache connectors | PASS | Isolated PostgreSQL and Redis integration tests |
| Synthetic public isolation | PASS | No public credentials, database, worker or model calls in exported artifact |
| Dependency and high/critical container findings | PASS | No findings at recorded scan time; reassess future changes |
| Versioned high/low architecture and study guide | PASS | /architecture, canonical snapshots, reference/fingerprint and diagram gates |
| Migration, persistence, backup/restore | PASS | Fresh schema and disposable recovery receipts |
| Public VPS capacity | BLOCKED | Root disk at 100%; owner decision needed for a specific disposable cache cleanup |
| Public HTTPS/end-to-end smoke | NOT RUN | No deployment while capacity is blocked |
| GitHub hosted CI | NOT RUN | Local equivalent checks passed; hosted result tracked separately after publication |
| Live provider behavior | NOT RUN | Optional adapter tested with simulated failure/budget cases only |
| Owner manual acceptance | NOT RUN | UAT_CHECKLIST.md is ready for owner review |
| v0.1.0 release tag | BLOCKED | Mandatory deployment smoke gate has not passed |

No mandatory failing test was suppressed. Do not convert NOT RUN or BLOCKED to PASS without new evidence. Source publication is separate from a verified release tag. P1/P2 omissions are listed in ROADMAP.md.
