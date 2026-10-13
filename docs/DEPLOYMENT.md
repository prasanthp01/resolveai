# Deployment

The public target is `portfolio.gappazappa.in`. Verify the current status in RELEASE_EVIDENCE.md before assuming it is live. Keep public content synthetic.

## Public static profile (small shared VPS)

Build the frontend and validate architecture. Export only the public endpoints:

```sh
npm --prefix web ci --ignore-scripts
npm --prefix web run build
uv run python scripts/architecture.py --check
uv run python scripts/export_demo.py /path/to/new-release-directory
```

The output contains React assets, the supplied logo, four synthetic scenario/report responses, the architecture index/snapshots, and static health responses. It contains no administrator endpoint implementation, environment file, credential, private data, or database.

Use the existing approved HTTPS proxy rather than replacing a server already using 80/443. `deploy/nginx-static-server.conf` is a template for an isolated vhost, with rate limits, GET/HEAD-only access, strict asset paths, and SPA deep-link fallback. Adapt the filesystem path to a dedicated release directory. Obtain and renew a valid certificate using the existing host certificate tooling. Test configuration before a graceful reload. Preserve a backup of the prior proxy file.

Use versioned release directories and an atomic `current` symlink switch. Keep the previous release for rollback. A static rollback does not migrate a database. Verify HTTPS, all four scenarios, `/architecture`, architecture API versions, deep-link reload, negative POST/private endpoint checks, and security headers after deployment. Confirm unrelated vhosts still respond as before.

## Public container profile

`docker build -t resolveai:0.1.0 .` builds the same demo and backend application. Run `RESOLVEAI_IMAGE=resolveai:0.1.0 docker compose -f deploy/compose.demo.yaml up -d`. It binds only host loopback 8130. Place an approved HTTPS proxy in front of it. This profile starts no database or worker and carries no live credentials.

## Private self-hosted profile

The private instance is separate from the public demo. Configure `deploy/private.env` with unique random MIGRATION_PASSWORD, APP_PASSWORD, runtime DATABASE_URL for `resolveai_app@db:5432/resolveai`, DEMO_MODE=false, COOKIE_SECURE=true, the exact HTTPS PUBLIC_ORIGIN, an external CONNECTOR_KEY, and narrow ALLOWED_CONNECTOR_NETWORKS. Use URL-safe random passwords or URL-encode them in DATABASE_URL. Keep this file mode 600, off Git and outside image build contexts.

`deploy/compose.private.yaml` starts PostgreSQL 18 with persistent storage at `/var/lib/postgresql`, an API, and one worker. The initialization script creates a non-superuser runtime role. The separately privileged migration identity owns schema changes. Start the DB first, run the maintenance-profile migration service, then start API and worker. Use the local bootstrap CLI with the private runtime configuration to create the owner; no default account is shipped.

Do not start this stack alongside a public instance without verifying available CPU, memory, disk, port allocation, and credential/network separation. The production DB and worker have no host-published ports. Configure encrypted off-host backups and perform a disposable restore before operational use.

## Release preflight

Inspect existing services, disk, memory, DNS, certificates, and proxy ownership. Preserve application data and unrelated services. Do not prune unknown volumes or remove unrelated data to make room. Record source SHA, image digest when applicable, migration version, artifact hash, verification time, and actual URL. Deployment blocked by host conditions must remain explicitly NOT DEPLOYED.

## Shared-proxy integration used for this release

The live proxy had a pre-existing stale individual-file bind mount. A new dedicated ResolveAI configuration file was loaded into its writable configuration directory and a matching read-only file mount was added to the canonical Compose definition for future recreation. This avoided restarting unrelated applications. On subsequent configuration changes, update the host ResolveAI file and the current container copy if the mount has not yet taken effect; validate with nginx -t, then gracefully reload. Do not recreate the proxy merely to deploy new static assets. Release changes use the dedicated current symlink.

The certificate-renewal hook is limited to the ResolveAI domain and validates the proxy before reload. The renewal dry run passed. Backups of the original proxy and Compose files are retained privately on the host. Deployment receipts intentionally omit unrelated service names and internal paths.
