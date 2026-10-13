# Security controls and boundaries

Private browser authentication uses Argon2 password hashes and expiring opaque sessions. Machine tokens are separate, scoped, hashed, expiring, and revocable. No default administrator exists in the source or image. Bootstrap is a local one-time command.

Public mode denies mutations globally and does not expose private endpoints. The recommended public static export contains no environment file, database, connector configuration, or live model key. Proxy limits restrict method, request rate, body size, framing, and content sources. Same-origin frontend assets are used; no analytics or external font service is enabled.

Credential encryption requires an external Fernet key. Application logs contain request IDs, methods, status and duration, not bodies or tokens. Reports record short observable facts and evidence citations. Common key/password/token/URL/email patterns are redacted, and connector responses use allowlisted fields. Treat redaction as defense in depth.

Production private databases have no host-published port. Runtime containers drop Linux capabilities, use an unprivileged application user, disallow privilege escalation, and use a read-only root filesystem. The migration/database operator remains privileged and must be protected separately.

Source/dependency scan receipts and tests are documented in TEST_REPORT.md and RELEASE_GATES.md. Outstanding limitations are visible. There is no multi-tenant isolation certification, unrestricted plugin marketplace, production repair executor, or GDPR compliance claim.
