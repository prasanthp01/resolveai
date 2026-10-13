"""Restore a dedicated LOCAL TEST PostgreSQL backup into a disposable database."""

import asyncio
import hashlib
import json
import os
import secrets
import subprocess
from datetime import datetime, timezone
from pathlib import Path
import asyncpg
from sqlalchemy.engine import make_url
from app.core.config import settings
from app.db.base import Base
import app.models.incident  # noqa: F401

DOCKER = ["docker", "--context", "colima", "exec", "-i", "resolveai-test-db-1"]


async def fingerprint(conn):
    values = {}
    for name in sorted(Base.metadata.tables):
        assert name.replace("_", "").isalnum()
        rows = await conn.fetch(f'SELECT row_to_json(t)::text AS data FROM "{name}" t')
        encoded = "\n".join(sorted(r["data"] for r in rows)).encode()
        values[name] = {"rows": len(rows), "sha256": hashlib.sha256(encoded).hexdigest()}
    values["migration"] = await conn.fetchval("SELECT version_num FROM alembic_version")
    return values


async def main():
    url = make_url(settings().database_url)
    assert url.host == "127.0.0.1" and url.port == 55433 and url.database == "resolveai", "TEST ONLY"
    kwargs = {"user": url.username, "password": url.password, "host": url.host, "port": url.port}
    original = await asyncpg.connect(**kwargs, database="resolveai")
    before = await fingerprint(original)
    dump = subprocess.check_output(
        DOCKER + ["pg_dump", "-U", "resolveai_app", "-d", "resolveai", "-Fc", "--no-owner"]
    )
    target = Path("../../work/v4-recovery.dump")
    target.write_bytes(dump)
    os.chmod(target, 0o600)
    name = "resolveai_restore_" + secrets.token_hex(6)
    subprocess.run(DOCKER + ["createdb", "-U", "resolveai_app", name], check=True)
    try:
        subprocess.run(
            DOCKER + ["pg_restore", "-U", "resolveai_app", "--dbname", name, "--no-owner", "--exit-on-error"],
            input=dump,
            check=True,
        )
        copy = await asyncpg.connect(**kwargs, database=name)
        restored = await fingerprint(copy)
        await copy.close()
        after = await fingerprint(original)
        assert before == restored == after, "Restored data or original data differs"
        receipt = {
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "scope": "isolated local private test database",
            "backup_sha256": hashlib.sha256(dump).hexdigest(),
            "backup_bytes": len(dump),
            "table_count": len(before) - 1,
            "row_count": sum(v["rows"] for k, v in before.items() if k != "migration"),
            "migration": before["migration"],
            "restore_matches_source": True,
            "original_unchanged": True,
            "result": "PASS",
        }
        Path("docs/v4/recovery.json").write_text(json.dumps(receipt, indent=2) + "\n")
        print(json.dumps(receipt, indent=2))
    finally:
        await original.close()
        subprocess.run(DOCKER + ["dropdb", "-U", "resolveai_app", name], check=True)


if __name__ == "__main__":
    asyncio.run(main())
