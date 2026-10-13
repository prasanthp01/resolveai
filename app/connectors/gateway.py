import asyncio
import ipaddress
import json
import ssl
from urllib.parse import urlparse
from typing import cast, Awaitable
import asyncpg
from redis.asyncio import Redis
from app.core.config import settings
from app.core.security import decrypt

OPERATIONS = {"postgres": {"health", "connections"}, "redis": {"health", "memory"}}


class PolicyDenied(ValueError):
    pass


def destination(host, port):
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        raise PolicyDenied("Use an explicitly allowlisted IP address; DNS destinations are disabled")
    if ip.is_link_local or ip.is_multicast or ip.is_unspecified:
        raise PolicyDenied("Forbidden destination")
    networks = [
        ipaddress.ip_network(x.strip()) for x in settings().allowed_connector_networks.split(",") if x.strip()
    ]
    if not any(ip in n for n in networks):
        raise PolicyDenied("Destination not allowlisted")
    internal = urlparse(settings().database_url.replace("postgresql+asyncpg", "postgresql"))
    if host == internal.hostname and port == (internal.port or 5432):
        raise PolicyDenied("Internal database cannot be a connector")
    return str(ip)


async def execute(connector, operation, environment_id):
    if settings().demo_mode:
        raise PolicyDenied("Live connectors are disabled in public demo")
    if not connector.enabled or connector.environment_id != environment_id:
        raise PolicyDenied("Connector scope denied")
    if operation not in OPERATIONS.get(connector.kind, set()):
        raise PolicyDenied("Operation not allowed")
    host = destination(connector.host, connector.port)
    password = decrypt(connector.secret)
    async with asyncio.timeout(8):
        if connector.kind == "postgres":
            conn = await asyncpg.connect(
                host=host,
                port=connector.port,
                user=connector.username,
                password=password,
                database=connector.database,
                timeout=3,
                command_timeout=3,
                ssl=ssl.create_default_context() if connector.tls else False,
                server_settings={"default_transaction_read_only": "on", "statement_timeout": "3000"},
            )
            try:
                if operation == "health":
                    result = {"available": await conn.fetchval("SELECT 1") == 1}
                else:
                    row = await conn.fetchrow(
                        "SELECT count(*)::int AS connections, count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS waiting, current_setting('max_connections')::int AS max_connections FROM pg_catalog.pg_stat_activity"
                    )
                    result = dict(row)
            finally:
                await conn.close()
        else:
            client = Redis(
                host=host,
                port=connector.port,
                username=connector.username,
                password=password,
                ssl=connector.tls,
                socket_connect_timeout=3,
                socket_timeout=3,
                decode_responses=True,
            )
            try:
                if operation == "health":
                    result = {"available": await cast(Awaitable[bool], client.ping())}
                else:
                    memory = await client.info("memory")
                    stats = await client.info("stats")
                    result = {
                        k: int((memory | stats).get(k, 0))
                        for k in ("used_memory", "maxmemory", "evicted_keys")
                    }
            finally:
                await client.aclose()
    if len(json.dumps(result)) > 8192:
        raise PolicyDenied("Result too large")
    return {"source": connector.kind + ".metrics", "data": result}
