# Changelog

## 0.3.2 — explainable stages and results

- Add plain-language and technical guides for all nine stages and final results, covering inputs, actions, outputs, errors and examples before and after execution.
- Keep instructional content separate from observed server events; summarize recorded output and retain detailed technical receipts.
- Distinguish partial completion with warnings, stopped/cancelled runs and completed investigations that abstain. Explain all final report fields and incomplete comparisons.
- Fix cancellation event serialization so SSE and polling retain the reason and can deliver the interrupted result.
- Record the presentation design in architecture 2.0.3 while retaining immutable history.

## 0.3.1 — guided simulation inputs

- Explain all 19 editable inputs with plain-language meanings, examples, schema-derived valid ranges and effects on the deterministic result.
- Add readable log/fault choices with selection-specific explanations and a matching JSON field guide.
- Associate guidance with each control for assistive technology and use a single-column field layout for readability.
- Record the input guidance design in architecture 2.0.2 while preserving earlier snapshots.

## 0.3.0 — v4 server-side incident studio

- Added bounded anonymous sessions and actual deterministic server runs, SSE/replay/polling, cancellation, expiry, admission limits, and evidence-based reports from editable inputs.
- Added six presets, plain-language/technical views, exception exercises, comparisons, and a responsive light case study with keyboard-accessible mobile navigation.
- Separated the public runtime from private connectors and storage; retained private durable ingestion and added configurable prefix/cookie scope and fail-closed AgentOps routing.
- Added architecture 2.0.0 and clarification 2.0.1, versioned contracts, local evaluation/benchmark and recovery evidence, isolated deployment profile, and migration/handoff documentation.

## 0.2.0 — editable browser simulation

- Added the original browser-only lab and four separately recorded backend receipts.
- Published architecture 1.1.0; retained earlier versions.

## 0.1.0 — initial public beta

- Preserved and extended the supplied FastAPI starter.
- Added authenticated scoped ingestion, signed webhooks, durable jobs, restricted diagnostics, reports, and a synthetic UI.
- Added a versioned architecture learning page with high-level/low-level diagrams, walkthroughs, and source-drift checks.
- Added isolated integration/security/evaluation tests, deployment profiles, recovery tooling, and engineering documentation.

Release/publication status is recorded in docs/RELEASE_EVIDENCE.md; this changelog alone does not establish a published release.

### Architecture records

- 1.0.0: initial high/low design, sequence/data diagrams, and walkthroughs.
- 1.0.1: improved dark-theme diagram contrast; retained 1.0.0 unchanged.
