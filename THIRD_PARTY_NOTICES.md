# Third-party notices

ResolveAI uses independently licensed open-source packages. Python and frontend dependencies are locked in uv.lock and web/package-lock.json. Their original notices remain with installed distributions. Core frameworks include FastAPI, Pydantic, SQLAlchemy, Alembic, asyncpg, Redis client, React, Vite, Mermaid, and Lucide.

The primary ResolveAI logo was supplied with the project as its approved brand asset. It is retained without redesign or recoloring. The project license does not grant trademark rights.

Dependency advisory scan results are recorded in docs/TEST_REPORT.md. The generated dependency inventories provide exact versions; they are not legal or security certifications. Review licenses when changing or redistributing dependencies.

Frontend distribution notices are preserved in [third-party-licenses.txt](web/public/third-party-licenses.txt), which is also shipped in the static export. khroma supplies its MIT license in its distribution even though the lockfile omits the license field. caniuse-lite build-time data uses CC-BY-4.0. Dependency licenses remain independent of the project Apache-2.0 license.

The vendored AI Ecosystem Contracts 1.0.0 schema resources are MIT-licensed, copyright 2026 AI Ecosystem contributors. Their license and checksum manifest are retained in `contracts/ecosystem-v1/`.

The test-only Contracts 1.0.0 Python validator and example fixtures retain their upstream MIT license in `tests/vendor/LICENSE`, source mappings and hashes in `tests/vendor/contracts-source.json`. They are excluded from runtime container builds.

Architecture SVG assets are generated from project-owned Mermaid definitions using Mermaid 11.17.2 (MIT) and the pinned build-only Mermaid CLI 11.17.0 (MIT). The CLI and its Puppeteer peer are development tools; normal builds validate checked-in assets, and no Mermaid/browser compiler executes in the public page. Chromium is supplied by the build operator and is not downloaded by the generation command.
