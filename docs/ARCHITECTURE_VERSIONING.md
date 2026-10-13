# Maintaining architecture versions

`architecture/index.json` lists snapshots in newest-first order and identifies the current version. Each `architecture/versions/<version>.json` is immutable once committed on the comparison branch. The page accepts `?version=1.0.0&view=low`; older snapshots remain accessible at `/api/v1/architecture/<version>`.

Use semantic architecture versions: major for fundamental component/trust-boundary changes, minor for new flows/components, patch for corrections that preserve the structure. Architecture and application versions are separate and explicitly linked.

When code changes:

1. Update the implementation and meaningful tests.
2. Review affected high-level, low-level, diagram, walkthrough, and code-reference sections.
3. Commit the implementation, then copy the current snapshot to a new version. Set source_commit to that implementation commit. Fill the date, changes, application version, and source_fingerprint from `scripts.architecture.fingerprint()`.
4. Add the new metadata to the index and update current. Do not overwrite an existing published snapshot.
5. Run `uv run python scripts/architecture.py --render`, then `--check`.
6. Run `uv run python scripts/check_architecture_history.py BASE_COMMIT` to verify earlier snapshots remain byte-identical.
7. Rebuild the frontend/static export and verify version selection in the browser.

Architecture-affecting source files are explicitly enumerated in scripts/architecture.py. Extend that list when adding a new implementation/configuration directory. The source commit avoids a circular hash: it points to the implementation commit; the subsequent documentation commit contains the snapshot. Build/release evidence records the final deployed commit separately.

## v4 integration paths

Application 0.3.0 adds architecture 2.0.0 because public simulation moves from browser-only calculation to an isolated server runtime. Study it at `/projects/resolveai/app/architecture`; read its index and immutable snapshots through `/api/projects/resolveai/v1/architecture`. The old root deployment retains its existing `/architecture` until the shared Portfolio cutover. Snapshots 1.0.0, 1.0.1 and 1.1.0 are preserved byte-for-byte.
