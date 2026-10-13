# Pinned test-only Contracts validator

Unmodified `SchemaRegistry` and semantic validation from Contracts 1.0.0, local tag `v1.0.0`, release commit `b55d1a9dc5d2bab23817b984b9801ccff7304f04`. Source paths and byte hashes (including valid/invalid examples) are in `contracts-source.json`. The upstream MIT license is retained. Only the offline validator is vendored; no service client or signing implementation is claimed.

Tests pass `contracts/ecosystem-v1` explicitly to `SchemaRegistry`; schemas retain their existing location and published hashes. These files are excluded from local Ruff formatting to preserve the upstream bytes. Test-only Python path configuration makes the canonical import available without a sibling checkout or network access.

The test dependency lock pins `jsonschema==4.26.0` and `rfc3339-validator==0.1.4`. An impossible-timestamp regression ensures the canonical date-time checker is active; the SDK signing dependencies are not needed by this offline validation subset.
