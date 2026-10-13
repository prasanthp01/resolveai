"""Read allowlisted synthetic receipts; public requests never run an investigation."""

import hashlib
import json
from pathlib import Path
from fastapi import HTTPException
from app.agents.investigate import scenarios

ROOT = Path(__file__).resolve().parents[2]


def simulation_fingerprint():
    files = sorted(
        list((ROOT / "app").rglob("*.py"))
        + [ROOT / "demo/scenarios.json", ROOT / "scripts/capture_simulations.py"]
    )
    return hashlib.sha256(
        b"".join(str(p.relative_to(ROOT)).encode() + b"\0" + p.read_bytes() + b"\0" for p in files)
    ).hexdigest()


def read_simulation(slug):
    if slug not in {s["slug"] for s in scenarios()}:
        raise HTTPException(404, "Simulation not found")
    path = ROOT / "demo/simulations" / f"{slug}.json"
    if not path.is_file():
        raise HTTPException(503, "Simulation recording unavailable")
    return json.loads(path.read_text())
