"""ResolveAI's bounded extension of the shared simulation v1 envelope."""

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

MODE = "SANDBOX_DETERMINISTIC"
FIXTURES_VERSION = "2.0.0"
RULES_VERSION = "2.0.0"
WORKFLOW_VERSION = "1.0.0"


class SimulationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    service: str = Field(default="payment-api", min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9-]*$")
    error_rate: float = Field(default=62, ge=0, le=100, allow_inf_nan=False)
    latency_ms: int = Field(default=2400, ge=0, le=60000)
    db_connections: int = Field(default=96, ge=0, le=10000)
    db_max_connections: int = Field(default=100, ge=1, le=10000)
    db_cpu_percent: float = Field(default=72, ge=0, le=100, allow_inf_nan=False)
    db_lock_waiters: int = Field(default=0, ge=0, le=1000)
    slow_queries: int = Field(default=0, ge=0, le=1000)
    redis_memory_mb: int = Field(default=200, ge=0, le=65536)
    redis_maxmemory_mb: int = Field(default=1024, ge=1, le=65536)
    redis_evictions: int = Field(default=0, ge=0, le=1000000)
    recent_deployment: bool = False
    previous_error_rate: float = Field(default=0.2, ge=0, le=100, allow_inf_nan=False)
    upstream_429: int = Field(default=0, ge=0, le=10000)
    retry_after_seconds: int = Field(default=2, ge=0, le=60)
    log_fixture: Literal[
        "pool_timeout",
        "query_timeout",
        "cache_miss",
        "release_error",
        "upstream_limit",
        "normal",
        "injection_attempt",
    ] = "pool_timeout"
    incident_context: str = Field(
        default="Synthetic checkout errors", max_length=200, pattern=r"^[a-zA-Z0-9 .,_()\-]*$"
    )
    fault: Literal[
        "none", "connector_timeout", "provider_429", "invalid_model_output", "workflow_timeout"
    ] = "none"
    seed: int = Field(default=42, ge=0, le=1000000)

    @model_validator(mode="after")
    def physical_bounds(self):
        if self.db_connections > self.db_max_connections:
            raise ValueError("db_connections must not exceed db_max_connections")
        if self.redis_memory_mb > self.redis_maxmemory_mb:
            raise ValueError("redis_memory_mb must not exceed redis_maxmemory_mb")
        return self


class SimulationStart(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    schema_version: Literal["1.0"]
    project_id: Literal["resolveai"]
    mode: Literal["SANDBOX_DETERMINISTIC", "REPLAY_RECORDED", "LIVE_MODEL_AUTHENTICATED"]
    preset_id: str | None = Field(default=None, max_length=64)
    input: SimulationInput
    seed: int = Field(ge=0, le=1000000)
    client_correlation_id: str = Field(
        min_length=1, max_length=96, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$"
    )

    @model_validator(mode="after")
    def seed_matches(self):
        if self.seed != self.input.seed:
            raise ValueError("seed must match input.seed")
        return self


PRESETS = [
    {
        "id": "payment-outage",
        "title": "Payment outage",
        "description": "Connection pressure coincides with failed checkout requests.",
        "input": SimulationInput().model_dump(),
    },
    {
        "id": "db-saturation",
        "title": "Database saturation",
        "description": "High CPU, slow queries and lock waits. Compare competing signals.",
        "input": SimulationInput(
            service="catalog-api",
            error_rate=18,
            db_connections=78,
            db_cpu_percent=96,
            slow_queries=12,
            db_lock_waiters=9,
            log_fixture="query_timeout",
        ).model_dump(),
    },
    {
        "id": "redis-pressure",
        "title": "Redis pressure",
        "description": "Memory pressure and evictions affect the synthetic cache.",
        "input": SimulationInput(
            service="session-api",
            error_rate=14,
            db_connections=25,
            redis_memory_mb=990,
            redis_evictions=820,
            log_fixture="cache_miss",
        ).model_dump(),
    },
    {
        "id": "release-regression",
        "title": "Release regression",
        "description": "Errors increase after a deployment while storage signals are healthy.",
        "input": SimulationInput(
            service="checkout-api",
            error_rate=32,
            db_connections=22,
            recent_deployment=True,
            log_fixture="release_error",
        ).model_dump(),
    },
    {
        "id": "provider-rate-limit",
        "title": "Provider rate limiting",
        "description": "An upstream returns 429 responses. No real provider is called.",
        "input": SimulationInput(
            service="notification-api",
            error_rate=24,
            db_connections=20,
            upstream_429=80,
            log_fixture="upstream_limit",
        ).model_dump(),
    },
    {
        "id": "insufficient-evidence",
        "title": "Insufficient evidence",
        "description": "An alert with healthy diagnostics should lead to abstention.",
        "input": SimulationInput(
            service="orders-api",
            error_rate=11,
            latency_ms=120,
            db_connections=20,
            db_cpu_percent=20,
            log_fixture="normal",
        ).model_dump(),
    },
]


class SimulationEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["1.0"]
    run_id: str
    project_id: Literal["resolveai"]
    event_id: str
    sequence: int = Field(ge=1, le=40)
    occurred_at: str
    step_id: str
    step_type: str
    component: str
    status: Literal["STARTED", "SUCCEEDED", "FAILED", "SKIPPED", "WAITING", "BLOCKED"]
    mode: Literal["SANDBOX_DETERMINISTIC"]
    title: str
    overview: str
    technical: dict
    duration_ms: float | None = Field(default=None, ge=0)
    trace_id: str | None = None
    usage: dict
    provenance: dict
    error: dict | None = None


class SimulationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["1.0"]
    project_id: Literal["resolveai"]
    run_id: str
    mode: Literal["SANDBOX_DETERMINISTIC"]
    status: Literal["ACCEPTED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"]
    app_version: str
    fixtures_version: str
    output: dict
    evidence: list[dict]
    errors: list[dict]
    cost: dict
    duration_ms: float = Field(ge=0)
    provenance: dict
    output_schema_version: str
    safety_status: Literal["REVIEW_REQUIRED"]
    warnings: list[str]
    limitations: list[str]
    usage: dict


class RunState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["1.0"]
    project_id: Literal["resolveai"]
    run_id: str
    mode: Literal["SANDBOX_DETERMINISTIC"]
    status: Literal["ACCEPTED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"]
    created_at: str
    completed_at: str | None
    event_count: int = Field(ge=0, le=40)
    result_ref: str | None
    expires_at: str
    last_sequence: int
    provenance: dict
    extensions: dict
