"""Export the bounded public API and SPA as static files; never export private data."""

import asyncio
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.main import demo_list, demo_scenario, simulation_trace, architecture, architecture_version  # noqa: E402
from app.version import APP_VERSION  # noqa: E402


async def export(destination):
    if destination.exists():
        raise SystemExit("Use a new output directory; preserve prior exports")
    shutil.copytree(ROOT / "web/dist", destination)
    shutil.copy2(ROOT / "web/public/resolveai-logo.png", destination / "resolveai-logo.png")

    def write(route, value):
        path = destination / route.strip("/") / "index.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, separators=(",", ":")))

    index = await architecture()
    write(
        "api/v1/config",
        {
            "demo": True,
            "version": APP_VERSION,
            "build_sha": index.get("source_commit", "see-architecture"),
            "live_ai_enabled": False,
        },
    )
    write("api/v1/demo/scenarios", await demo_list())
    for s in await demo_list():
        write("api/v1/demo/scenarios/" + s["slug"], await demo_scenario(s["slug"]))
        write("api/v1/demo/scenarios/" + s["slug"] + "/trace", await simulation_trace(s["slug"]))
    write("api/v1/architecture", index)
    for v in index["versions"]:
        write("api/v1/architecture/" + v["version"], await architecture_version(v["version"]))
    write("health/live", {"status": "OK", "mode": "synthetic-static"})
    write("health/ready", {"status": "ready", "mode": "synthetic-static", "database_required": False})
    print("Exported public synthetic assets only:", destination)


if __name__ == "__main__":
    asyncio.run(export(Path(sys.argv[1])))
