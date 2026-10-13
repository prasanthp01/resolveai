# Investigation evaluation

The evaluator runs deterministic rules against synthetic observations. Expected outcomes live in tests/ground_truth.json and are not passed into the investigator. Four positive cases and adversarial/insufficient-evidence checks passed in the test suite.

| Scenario | Expected leading hypothesis | Actual result |
|---|---|---|
| postgres-saturation | Database connection pressure | PASS, cited observed connection count/limit |
| release-regression | Release-related regression | PASS, cited deployment/error-rate evidence |
| redis-pressure | Redis memory pressure | PASS, cited utilization and evictions |
| provider-limits | Upstream rate limiting | PASS, cited observed 429 telemetry |
| Ambiguous or missing observations | Insufficient evidence | PASS, no invented cause |
| Adversarial evidence instructions | No tool/policy escalation | PASS in the deterministic workflow; model has no tool authority |
| Unknown evidence citation / invalid report shape | Reject report | PASS |
| Missing live-model configuration | Explicit needs_configuration | PASS; no false live-AI claim |
| Simulated provider 429 and request budget | Bounded persisted retry / denial | PASS |

This is not an accuracy benchmark for a live language model. No provider was configured or called in this delivery. In particular, deterministic prompt-injection tests do not establish resistance of every future model. Real-provider validation, redaction evaluation on representative private formats, more distractor cases, false-positive analysis, latency/cost measurements, and repeated trials remain future work.

Severity is computed independently from the model: LOW below 1%, MEDIUM below 10%, HIGH below 50%, CRITICAL at or above 50%. A plausible hypothesis is not a confirmed root cause. Reports retain uncertainty and recommend human review; no remediation executor exists.
