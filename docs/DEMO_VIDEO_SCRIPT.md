# Demo recording scripts

No video recording is claimed by this file. Record the actual running application after verifying its URL.

## 90–120 second product walkthrough

0–15s: Show Overview. Explain that this is an evidence-first incident investigation tool and the public experience uses synthetic data.
15–35s: Open the payment API saturation scenario. Show the observed error rate and synthetic-mode label.
35–55s: Replay the timeline. Explain that this is deterministic playback, not a live model call.
55–80s: Read the plausible cause, click its evidence reference, and show uncertainty and human-reviewed recommendations.
80–105s: Open Architecture. Switch High level → Low level → Walkthroughs. Show the version, source link, and version history.
105–120s: Show Integrations and explain that real restricted PostgreSQL/Redis adapters belong to the authenticated self-hosted environment.

## 5–7 minute technical walkthrough

Trace POST /events through validation, credential scope, the transactional incident/job write, worker claim, evidence collection, and fenced report persistence. Show the concurrency and stale-claim tests. Explain fixture/live distinctions and missing-provider behavior. Open the architecture source record and its consistency check. End with the current release gates and accurately state any unrun live-provider or deployment checks.
