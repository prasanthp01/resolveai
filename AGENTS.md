# ResolveAI contributor contract

Keep the public demo synthetic. Preserve existing data and unrelated services. No unrestricted SQL, shell, HTTP, Redis value access, or automatic remediation tools.

When architecture-affecting behavior changes, update the high- and low-level explanations, diagrams, and code references in a NEW architecture snapshot. Do not rewrite a published snapshot. Link the snapshot to the application version and source commit; include a concrete reason in its changes list. Update architecture/index.json and generate docs/ARCHITECTURE.md from the same snapshot.

Run the architecture consistency and history checks with the test suite before release. Fingerprint checks detect drift but do not verify the prose; review the explanation against the implementation. Keep credentials and local paths out of public documentation and artifacts. Use explicit PASS, FAILED, BLOCKED, and NOT RUN results.
