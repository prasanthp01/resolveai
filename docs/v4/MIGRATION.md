# Prefix deployment and rollback

Serve the application at `/projects/resolveai/app/` and the sandbox at `/api/projects/resolveai/`. Build with the configured Vite base; preserve these prefixes in the reverse proxy. The application-owned widget loads from `/projects/resolveai/app/widget/resolveai-studio.js`.

Use a new immutable static release directory for each build. Verify asset hashes, API health, cookie scope, SSE, the full studio and architecture routes before atomically switching the active symlink. Keep the previous symlink target for rollback. Database backups must be restored into a disposable instance before a private-schema migration. Never reuse the public sandbox as a diagnostic bridge to private services.

The repository contains deployment templates, not credentials or a specific operator's server paths. See [self-hosting](SELF_HOST.md) and [operations](../OPERATIONS.md).
