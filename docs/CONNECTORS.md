# Restricted diagnostic connectors

Connectors are registered by the owner and bound to an environment. Only fixed named capabilities are executable. Destinations must be literal IP addresses within operator-configured ALLOWED_CONNECTOR_NETWORKS. Link-local, multicast, unspecified, unapproved, and the configured internal database destination are rejected. DNS names and redirects are not supported in v0.1.

The public demo uses fixture equivalents and has no connector credentials. Live self-hosted connector secrets require a Fernet CONNECTOR_KEY stored outside the database. Back up this key separately; without it, encrypted credentials cannot be recovered.

## PostgreSQL

Supported operations are health (SELECT 1) and connections (aggregate counts from pg_catalog.pg_stat_activity and max_connections). No query text or customer rows are read. Sessions use default_transaction_read_only and a three-second statement timeout. The application also allowlists the exact operation.

Create a dedicated LOGIN role with no superuser, createdb, or createrole rights. Grant CONNECT to the monitored database and set default_transaction_read_only=on. The current diagnostics use PostgreSQL's catalog view visibility without blanket pg_monitor membership. Wait details for other sessions may be hidden; the report must state this visibility limitation. For fuller metrics, design a narrowly scoped aggregate function and review it separately. Database statistics alone do not prove application pool exhaustion.

## Redis

Supported operations are health (PING) and memory (INFO memory + INFO stats). Only used_memory, maxmemory, and evicted_keys are returned. A suitable dedicated ACL is `on >REPLACE_WITH_SECRET -@all +ping +info`, with no key patterns. Do not use that literal placeholder as a password. GET, KEYS, SCAN, CONFIG, FLUSH*, SHUTDOWN, and Lua commands are not allowed through the gateway.

TLS is on by default and validates certificates. IP-based TLS requires the server certificate to be valid for that IP. Disabling TLS is only appropriate for a trusted isolated network or loopback test instance. There is no public-hosted customer connectivity feature.

## Adapter contract

A connector has kind, environment, destination, credential, enabled flag, and typed operation. `execute` validates policy before opening a connection and returns source plus bounded structured data. Execution is capped at eight seconds and 8 KiB. At most four connectors are collected per investigation. An unavailable connector yields an explicit partial collection outcome. Add adapters by extending the registry/operation allowlist, safe schema, scope/network rules, and isolated positive and negative tests.
