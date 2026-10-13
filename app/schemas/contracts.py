from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class IncidentCreate(Strict):
    event_id: str = Field(min_length=1, max_length=100)
    service: str = Field(min_length=1, max_length=100)
    error_rate: float = Field(ge=0, le=100)
    message: str = Field(min_length=1, max_length=2000)
    observed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    scenario: (
        Literal["postgres-saturation", "release-regression", "redis-pressure", "provider-limits"] | None
    ) = None
    mode: Literal["fixture", "live"] = "fixture"

    @field_validator("observed_at")
    @classmethod
    def aware(cls, v):
        if v.tzinfo is None:
            raise ValueError("Include a timezone")
        return v.astimezone(timezone.utc)


class Login(Strict):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class AppCreate(Strict):
    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,79}$")


class EnvCreate(Strict):
    name: str = Field(min_length=1, max_length=60)


class CredentialCreate(Strict):
    environment_id: str
    name: str = Field(min_length=1, max_length=80)
    days: int = Field(default=90, ge=1, le=365)


class ConnectorCreate(Strict):
    environment_id: str
    name: str = Field(min_length=1, max_length=80)
    kind: Literal["postgres", "redis"]
    host: str = Field(max_length=80)
    port: int = Field(ge=1, le=65535)
    database: str = Field(default="postgres", pattern=r"^[a-zA-Z0-9_]{1,80}$")
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=500)
    tls: bool = True


class Note(Strict):
    note: str = Field(max_length=2000)


class Hypothesis(Strict):
    title: str = Field(max_length=200)
    rationale: str = Field(max_length=1000)
    evidence_ids: list[str] = Field(max_length=12)


class InvestigationReport(Strict):
    summary: str = Field(max_length=2000)
    severity: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    impact: str = Field(max_length=500)
    hypotheses: list[Hypothesis] = Field(max_length=5)
    supporting_evidence_ids: list[str] = Field(max_length=12)
    contradicting_evidence_ids: list[str] = Field(max_length=12)
    uncertainty: str = Field(min_length=1, max_length=1000)
    recommended_next_steps: list[str] = Field(max_length=6)
    investigation_mode: Literal["fixture", "live", "needs_configuration"]
    started_at: datetime
    completed_at: datetime
