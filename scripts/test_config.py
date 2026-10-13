"""Create test-only configuration for the dedicated Compose services."""

import os
import secrets
from pathlib import Path
from cryptography.fernet import Fernet

p = Path(".env")
if p.exists():
    raise SystemExit("Existing .env preserved. Use a fresh checkout or configure test settings explicitly.")
password = secrets.token_urlsafe(24)
values = {
    "TEST_DB_PASSWORD": password,
    "DATABASE_URL": f"postgresql+asyncpg://resolveai_app:{password}@127.0.0.1:55433/resolveai",
    "DEMO_MODE": "false",
    "COOKIE_SECURE": "false",
    "PUBLIC_ORIGIN": "http://localhost:8130",
    "CONNECTOR_KEY": Fernet.generate_key().decode(),
    "ALLOWED_CONNECTOR_NETWORKS": "127.0.0.1/32",
}
p.write_text("".join(f"{k}={v}\n" for k, v in values.items()))
os.chmod(p, 0o600)
print("Created private test-only configuration. No secret values printed.")
