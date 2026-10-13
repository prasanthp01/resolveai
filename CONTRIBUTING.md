# Contributing

Use a dedicated branch and disposable PostgreSQL/Redis test services. Keep changes small enough to explain. Add tests for observable behavior and security/recovery invariants, not implementation trivia. Run the commands in README.md before opening a pull request.

Changes to ingestion, identity, durable jobs, evidence, connectors, reports, frontend flows, deployment, or their contracts must include a new architecture snapshot and updated explanations. Follow docs/ARCHITECTURE_VERSIONING.md. Do not rewrite published snapshots or claim unrun checks passed.

Connector contributions require typed bounded operations, scope enforcement, credential isolation, destination controls, positive integration tests, and negative permission tests. Do not introduce arbitrary execution capabilities.

Use synthetic examples in issues and tests. Do not include credentials, raw customer logs, personal information, private deployment addresses, or database dumps. Report security issues privately as described in SECURITY.md.
