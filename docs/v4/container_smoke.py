import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
import httpx
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

root = Path(__file__).resolve().parents[2]
schemas = [json.loads(p.read_text()) for p in (root / "contracts/ecosystem-v1").glob("*.schema.json")]
registry = Registry().with_resources((s["$id"], Resource.from_contents(s)) for s in schemas)


def validate(name, data):
    schema = next(s for s in schemas if s["$id"].endswith("/" + name + ".schema.json"))
    Draft202012Validator(schema, registry=registry, format_checker=FormatChecker()).validate(data)


base = os.getenv("RESOLVEAI_PREVIEW_URL", "http://127.0.0.1:8133")
prefix = "/api/projects/resolveai"
checks = []


def check(name, value):
    assert value, name
    checks.append({"name": name, "status": "PASS"})


with httpx.Client(base_url=base, timeout=15) as client:
    response = client.get("/projects/resolveai/app/studio")
    check("prefixed SPA deep link", response.status_code == 200)
    check(
        "static security headers",
        response.headers.get("x-frame-options") == "DENY"
        and "frame-ancestors 'none'" in response.headers.get("content-security-policy", ""),
    )
    assets = re.findall(r'(?:src|href)="(/projects/resolveai/app/assets/[^"]+)"', response.text)
    check("prefixed static assets", len(assets) > 0 and all(client.get(a).status_code == 200 for a in assets))
    check(
        "approved logo",
        client.get("/projects/resolveai/app/resolveai-logo.png").headers.get("content-type") == "image/png",
    )
    check("architecture deep link", client.get("/projects/resolveai/app/architecture").status_code == 200)
    arch = client.get(prefix + "/v1/architecture").json()
    check("versioned architecture", arch["current"] == "2.0.1" and len(arch["versions"]) == 5)
    for v in arch["versions"]:
        check(
            "architecture " + v["version"],
            client.get(prefix + "/v1/architecture/" + v["version"]).status_code == 200,
        )
    schema = client.get(prefix + "/simulation/schema")
    validate("simulation-schema", schema.json())
    client.headers.update({"Origin": base, "X-CSRF-Token": schema.headers["x-csrf-token"]})
    check(
        "scoped session",
        "HttpOnly" in schema.headers["set-cookie"] and "Path=" + prefix in schema.headers["set-cookie"],
    )
    presets = client.get(prefix + "/simulation/presets").json()
    validate("simulation-presets", presets)
    item = presets["presets"][0]
    payload = {
        "schema_version": "1.0",
        "project_id": "resolveai",
        "mode": "SANDBOX_DETERMINISTIC",
        "input": item["input"],
        "seed": item["seed"],
        "preset_id": item["preset_id"],
        "client_correlation_id": "container-smoke",
    }
    start = client.post(prefix + "/simulations", json=payload)
    check("POST admission", start.status_code == 202)
    validate("simulation-run", start.json())
    rid = start.json()["run_id"]
    stream = client.get(prefix + f"/simulations/{rid}/events", headers={"Accept": "text/event-stream"})
    check(
        "real streamed completion",
        stream.status_code == 200 and "event: step" in stream.text and "event: end" in stream.text,
    )
    events = client.get(prefix + f"/simulations/{rid}/events").json()
    validate("simulation-events", events)
    check(
        "ordered events",
        len(events["events"]) == 18 and [e["sequence"] for e in events["events"]] == list(range(1, 19)),
    )
    result = client.get(prefix + f"/simulations/{rid}/result").json()
    validate("simulation-result", result)
    check(
        "final evidence-cited result",
        result["output"]["hypotheses"][0]["title"] == "Database connection pressure"
        and result["provenance"]["source_revision"] == os.environ["RESOLVEAI_EXPECTED_SHA"],
    )
    replay = client.get(
        prefix + f"/simulations/{rid}/events", headers={"Accept": "text/event-stream", "Last-Event-ID": "16"}
    )
    check("SSE replay cursor", "id: 17\n" in replay.text and "id: 16\n" not in replay.text)
    duplicate = client.post(prefix + "/simulations", json=payload)
    check("idempotent HTTP retry", duplicate.status_code == 200 and duplicate.json()["run_id"] == rid)
    bad = {**payload, "input": {**payload["input"], "error_rate": 120}, "client_correlation_id": "invalid"}
    response = client.post(prefix + "/simulations", json=bad)
    validate("error", response.json())
    check(
        "typed invalid-input error",
        response.status_code == 422 and "error_rate" in response.json()["message"],
    )
    with httpx.Client(base_url=base, timeout=10) as foreign:
        foreign.get(prefix + "/simulation/schema")
        check("foreign run isolation", foreign.get(prefix + f"/simulations/{rid}/result").status_code == 404)
    check(
        "origin denial",
        client.post(
            prefix + "/simulations", json=payload, headers={"Origin": "https://wrong.invalid"}
        ).status_code
        == 403,
    )
    check("private routes absent", client.get(prefix + "/v1/credentials").status_code == 404)
    fault = {
        **payload,
        "input": {**payload["input"], "fault": "workflow_timeout"},
        "client_correlation_id": "cancel-me",
    }
    started = client.post(prefix + "/simulations", json=fault).json()
    cancelled = client.post(prefix + "/simulations/" + started["run_id"] + "/cancel", json={})
    check("bounded cancellation", cancelled.status_code == 200 and cancelled.json()["status"] == "CANCELLED")
    check("public OpenAPI", client.get(prefix + "/openapi.json").status_code == 200)
    inspect = json.loads(
        subprocess.check_output(
            [
                "docker",
                "--context",
                os.getenv("RESOLVEAI_DOCKER_CONTEXT", "default"),
                "inspect",
                "resolveai-sandbox-sandbox-1",
            ],
            text=True,
        )
    )[0]
    network = json.loads(
        subprocess.check_output(
            [
                "docker",
                "--context",
                os.getenv("RESOLVEAI_DOCKER_CONTEXT", "default"),
                "network",
                "inspect",
                "resolveai-public-sandbox",
            ],
            text=True,
        )
    )[0]
    check("no private mount", not inspect["Mounts"])
    check("internal network", network["Internal"] and len(inspect["NetworkSettings"]["Networks"]) == 1)
    check(
        "read-only nonroot process",
        inspect["HostConfig"]["ReadonlyRootfs"] and inspect["Config"]["User"] == "10001",
    )
    check(
        "resource limits",
        inspect["HostConfig"]["Memory"] == 192 * 1024 * 1024
        and inspect["HostConfig"]["NanoCpus"] == 350000000,
    )
    receipt = {
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "environment": "local Colima Linux amd64 release image behind isolated Nginx; not VPS HTTPS",
        "app_version": "0.3.0",
        "architecture": "2.0.1",
        "status": "PASS",
        "checks": checks,
        "result_summary": result["output"]["summary"],
        "run_duration_ms": result["duration_ms"],
        "image_id": inspect["Image"],
    }
    (root / "docs/v4/container-routing.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))
