# Study the actual implementation

Start with `/architecture`. Use High level for component purposes, Low level for the request sequence and data relationships, Walkthroughs for exercises, and Version history to connect an explanation to code.

| Study question | Start here | Exercise |
|---|---|---|
| What is accepted input? | app/schemas/contracts.py / IncidentCreate | Reject blank IDs and out-of-range percentages |
| How is data persisted? | app/models/incident.py / Incident | Compare request fields with stored state |
| When is work accepted? | app/services/incidents.py / ingest | Locate the commit before HTTP 202 |
| Why are duplicate alerts safe? | unique source/event constraint | Send the same event concurrently |
| What if a worker crashes? | app/jobs/worker.py / claim, fence | Run the stale-completion test |
| How is a tool authorized? | app/connectors/gateway.py / execute | Try another environment and a forbidden operation |
| Where does evidence become a report? | app/agents/investigate.py | Trace IDs through validate_report |
| What blocks injection? | gateway capability checks; no model execution tool | Run the adversarial variant |
| What does the browser trust? | web/src/api.ts and ReportView | Follow an evidence link and observe uncertainty |
| What keeps docs current? | scripts/architecture.py | Change a rule and observe the drift check fail |

Suggested sequence: first trace a fixture incident end to end; next study a failure path; then inspect a real restricted connector test; finally change one severity boundary with tests and a new architecture version. This owner-authored improvement is a useful learning milestone. Use disposable services for crash/restore exercises.
