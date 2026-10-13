# Deployment

## Public synthetic studio

Follow [SELF_HOST.md](v4/SELF_HOST.md). The current interactive studio uses `deploy/compose.sandbox.yaml`; `compose.demo.yaml` and static export scripts retain an older recorded-demo profile. A static export does not execute editable server workflows.

Set `PUBLIC_ORIGIN` to your exact HTTPS origin, terminate TLS at a maintained reverse proxy and forward the service's loopback port. Preserve Origin headers, disable SSE buffering and enforce bounded bodies, timeouts and request rates at the edge. Monitor readiness, container restarts and host capacity. Keep one sandbox API process: runs and sessions are bounded, ephemeral and intentionally expire on restart.

## Private self-hosted runtime

This is a separate deployment, never a replacement for an anonymous public backend. Create `deploy/private.env` with mode 0600, unique URL-safe `MIGRATION_PASSWORD` and `APP_PASSWORD`, a `DATABASE_URL` for `resolveai_app@db:5432/resolveai`, `DEMO_MODE=false`, `COOKIE_SECURE=true`, your exact HTTPS `PUBLIC_ORIGIN`, a Fernet `CONNECTOR_KEY`, and narrow `ALLOWED_CONNECTOR_NETWORKS`.

`deploy/compose.private.yaml` keeps PostgreSQL and the worker off host ports. The migration identity owns schema changes; the application identity has restricted runtime grants. Start the database, run the maintenance-profile migration, bootstrap an owner with the CLI, then start the API and worker. Do not share public and private credentials, networks or storage. See [connector minimum privileges](CONNECTORS.md).

Use the image built from your reviewed source commit and record its digest. Never bake private environment files into an image. Configure encrypted off-host backups and execute a restore to a new isolated database before accepting private data; see [operations](OPERATIONS.md). Keep prior images for application rollback and review schema compatibility before rolling back across migrations.

## Release checks

Verify the configured origin, TLS, secure cookies, health, success and controlled-failure scenarios, session ownership, negative private-route checks and SSE through the real proxy. Check CPU, memory, disk and log rotation. Observe existing services before and after any proxy change. Configuration templates require adaptation to your host; they do not certify its security or capacity.

Live LLM quality, external billing, production load and independent penetration tests are not established by the synthetic release. Keep external model use disabled until separately configured, budgeted and validated.
