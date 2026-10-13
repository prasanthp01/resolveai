"""Bounded local ASGI benchmark and real deterministic-run receipt capture."""

import asyncio
import json
import os
import platform
import resource
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path
from httpx import AsyncClient, ASGITransport
from app.sandbox.main import create_app, PREFIX
from app.sandbox.runtime import RunStore
from app.sandbox.contracts import PRESETS
from app.version import APP_VERSION


async def main():
    store = RunStore()
    app = create_app(store, origin="http://benchmark.test", secure=False)
    semaphore = asyncio.Semaphore(4)
    durations, dispatch, receipts = [], [], []
    usage_before = resource.getrusage(resource.RUSAGE_SELF)
    started = time.perf_counter()

    async def execute(i):
        async with semaphore:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://benchmark.test"
            ) as client:
                schema = await client.get(PREFIX + "/simulation/schema")
                client.headers.update(
                    {"Origin": "http://benchmark.test", "X-CSRF-Token": schema.headers["x-csrf-token"]}
                )
                preset = PRESETS[i % len(PRESETS)]
                request = {
                    "schema_version": "1.0",
                    "project_id": "resolveai",
                    "mode": "SANDBOX_DETERMINISTIC",
                    "input": preset["input"],
                    "seed": preset["input"]["seed"],
                    "preset_id": preset["id"],
                    "client_correlation_id": f"benchmark-{i}",
                }
                timer = time.perf_counter()
                response = await client.post(PREFIX + "/simulations", json=request)
                assert response.status_code == 202, response.text
                ack = (time.perf_counter() - timer) * 1000
                run = store.runs[response.json()["run_id"]]
                assert run.task is not None
                await run.task
                result = (await client.get(PREFIX + f"/simulations/{run.id}/result")).json()
                assert result["status"] == "SUCCEEDED"
                durations.append((time.perf_counter() - timer) * 1000)
                dispatch.append(ack)
                if i < len(PRESETS):
                    receipts.append(
                        {
                            "preset_id": preset["id"],
                            "request": request,
                            "result": result,
                            "events": (await client.get(PREFIX + f"/simulations/{run.id}/events")).json()[
                                "events"
                            ],
                        }
                    )

    await asyncio.gather(*[execute(i) for i in range(24)])
    elapsed = time.perf_counter() - started
    usage = resource.getrusage(resource.RUSAGE_SELF)
    result = {
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "application_version": APP_VERSION,
        "environment": "local ASGI transport; not a public-VPS or network benchmark",
        "machine": platform.machine(),
        "cpu_count": os.cpu_count(),
        "runs": 24,
        "concurrency": 4,
        "failures": 0,
        "elapsed_seconds": round(elapsed, 3),
        "throughput_runs_per_second": round(24 / elapsed, 3),
        "p50_ms": round(statistics.median(durations), 3),
        "p95_ms": round(sorted(durations)[22], 3),
        "admission_p95_ms": round(sorted(dispatch)[22], 3),
        "queue_wait": "not applicable: bounded admission, no sandbox queue",
        "checkpoint_pacing_ms_per_stage": 60,
        "cpu_seconds": round(
            usage.ru_utime + usage.ru_stime - usage_before.ru_utime - usage_before.ru_stime, 3
        ),
        "peak_rss_mib": round(usage.ru_maxrss / (1024 * 1024 if platform.system() == "Darwin" else 1024), 2),
        "external_model_spend_usd": 0,
        "hosting_cost_per_run": "not measured",
        "result": "PASS",
    }
    Path("docs/v4/sandbox-benchmark.json").write_text(json.dumps(result, indent=2) + "\n")
    Path("demo/studio-receipts.json").write_text(
        json.dumps(
            {
                "provenance": "Recorded actual local ASGI sandbox executions; timings are measured, fixtures synthetic",
                "recorded_at": result["measured_at"],
                "runs": receipts,
            },
            indent=2,
        )
        + "\n"
    )
    print(json.dumps(result, indent=2))
    await store.close()


if __name__ == "__main__":
    asyncio.run(main())
