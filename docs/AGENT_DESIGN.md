# Investigation workflow and evaluation

The workflow is explicit typed Python: validate context → severity → bounded evidence collection → fixture or optional model analysis → schema/citation validation → fenced persistence. It uses the durable job and run state already stored in PostgreSQL; LangGraph was not added because the current linear workflow does not need another checkpoint system.

Severity uses the reported error percentage: LOW below 1, MEDIUM from 1 to below 10, HIGH from 10 to below 50, CRITICAL at 50 or more. Severity is not proof of business impact. The reported affected user count remains unknown.

Fixture mode evaluates evidence numerically and is labeled synthetic/deterministic. It does not contact a model. Four scenarios cover connection pressure, release correlation, Redis pressure, and upstream rate limiting. Ground truth stays in tests/ground_truth.json and is not included in investigation input. Ambiguous and malicious free-text variants should yield insufficient evidence and no executable action.

The optional provider adapter targets the fixed OpenAI API endpoint and requires explicit LLM_ENABLED, LLM_API_KEY, and LLM_MODEL configuration. It has no arbitrary endpoint field and no tools. Each request reserves daily budget in a transaction protected by an advisory lock. Reservations conservatively count failed calls. Response output is bounded, schema-validated, and checked against known evidence IDs. Retries reuse the logical job ID as a provider idempotency hint; provider-side exactly-once behavior is not guaranteed.

The run has a 50-second timeout, each connector eight seconds, and model HTTP calls 25 seconds. A single worker is the default, with three persisted attempts. Retry-After seconds are honored up to one hour. Both numeric and HTTP-date Retry-After forms are parsed with a one-hour bound. No private chain-of-thought, model credentials, raw SQL tools, shell tools, or autonomous remediation are exposed.

Live model tests require owner-configured credentials and a budget. They are NOT RUN in this synthetic-only delivery. Mocked failures and deterministic evaluations do not establish live-model accuracy or commercial incident performance.
