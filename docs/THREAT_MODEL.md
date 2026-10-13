# Threat model

Assets: owner sessions, integration credentials, connector secrets, incident metadata, evidence, reports, audit history, model budget, and host resources. Actors: public visitors, untrusted monitoring senders, authenticated owner, compromised evidence sources, worker processes, external services, and repository contributors.

Trust boundaries are shown in ARCHITECTURE.md. Evidence and model output never grant execution authority.

| Threat | Implemented boundary | Verification |
|---|---|---|
| Anonymous/admin abuse | Private auth guard; demo rejects writes before dependencies | anonymous/machine credential and public boundary tests |
| Cross-source access | Credential-derived environment and source predicates | source-isolation integration test |
| Credential leakage | Hashes for tokens; external-key encryption; one-time reveal; safe errors | secret-redaction and connector response tests |
| CSRF/session misuse | SameSite/HttpOnly cookies; CSRF hash; exact origin; expiry/revoke | CSRF, origin, logout, session-expiry tests |
| Forged/replayed webhook | Constant-time HMAC; timestamp bounds; persisted replay key | tamper/stale/replay tests |
| SSRF | Literal IP allowlists; forbidden range rejection; no arbitrary fetch tool | metadata/loopback/unapproved destination tests |
| Prompt injection/excessive agency | No executable model tools; fixed gateway capabilities | adversarial fixture and forbidden-operation tests |
| SQL/Redis abuse | Fixed queries; read-only PG session; Redis ACL; no cached values | real isolated role/ACL and negative operation tests |
| Duplicate/stale jobs | Unique source/event; atomic claim; expiring lease; fencing | concurrent ingestion/claim and stale-completion tests |
| Expensive model flooding | Default disabled; request reservations and bounded calls | budget and provider-failure tests |
| Demo pivot | Public static assets contain only synthetic records and architecture | export inspection and public negative checks |
| Host/service disruption | Dedicated data/services; no published production DB port | Compose checks and deployment inventory |
| Dependency/CI compromise | Locked packages; advisory scans; minimal CI permissions | dependency reports, reviewed workflow |

Residual risks: a database administrator can modify history; redaction does not identify every possible personal/secret format; an authenticated owner controls destination enrollment; application limits do not replace host DDoS protection; TLS and backup key management remain operator responsibilities. This is not an independent security audit or compliance certification.

The controls address relevant OWASP API object authorization, resource consumption, SSRF, authentication, and configuration concerns; LLM prompt-injection and excessive-agency risks; and NIST SSDF practices for protected source, verification, and vulnerability response. This mapping is a design aid, not a certification claim.
