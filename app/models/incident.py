from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import String, Text, ForeignKey, UniqueConstraint, Index, CheckConstraint, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


def now():
    return datetime.now(timezone.utc)


def uid():
    return str(uuid4())


class Identity:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class User(Identity, Base):
    __tablename__ = "users"
    username: Mapped[str] = mapped_column(String(80), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)


class LoginSession(Identity, Base):
    __tablename__ = "sessions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Application(Identity, Base):
    __tablename__ = "applications"
    name: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str] = mapped_column(String(80), unique=True)


class Environment(Identity, Base):
    __tablename__ = "environments"
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    __table_args__ = (UniqueConstraint("application_id", "name"),)


class Credential(Identity, Base):
    __tablename__ = "integration_credentials"
    environment_id: Mapped[str] = mapped_column(ForeignKey("environments.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    webhook_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    revoked: Mapped[bool] = mapped_column(default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Connector(Identity, Base):
    __tablename__ = "connectors"
    environment_id: Mapped[str] = mapped_column(ForeignKey("environments.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(20))
    host: Mapped[str] = mapped_column(String(80))
    port: Mapped[int]
    database: Mapped[str] = mapped_column(String(80), default="postgres")
    username: Mapped[str] = mapped_column(String(80))
    secret: Mapped[str] = mapped_column(Text)
    tls: Mapped[bool] = mapped_column(default=True)
    enabled: Mapped[bool] = mapped_column(default=True)
    last_health: Mapped[str] = mapped_column(String(30), default="NOT_TESTED")
    __table_args__ = (CheckConstraint("kind in ('postgres','redis')"),)


class Incident(Identity, Base):
    __tablename__ = "incidents"
    event_id: Mapped[str] = mapped_column(String(100))
    source_id: Mapped[str] = mapped_column(ForeignKey("integration_credentials.id"))
    environment_id: Mapped[str] = mapped_column(ForeignKey("environments.id"))
    payload_hash: Mapped[str] = mapped_column(String(64))
    service: Mapped[str] = mapped_column(String(100))
    message: Mapped[str] = mapped_column(Text)
    error_rate: Mapped[float]
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    severity: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(30), default="QUEUED")
    mode: Mapped[str] = mapped_column(String(20), default="fixture")
    scenario: Mapped[str | None] = mapped_column(String(80), nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    __table_args__ = (
        UniqueConstraint("source_id", "event_id"),
        CheckConstraint("error_rate >= 0 AND error_rate <= 100"),
        Index("ix_incidents_env_status_created", "environment_id", "status", "created_at"),
    )


class Job(Identity, Base):
    __tablename__ = "jobs"
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), unique=True)
    status: Mapped[str] = mapped_column(String(30), default="PENDING")
    attempts: Mapped[int] = mapped_column(default=0)
    version: Mapped[int] = mapped_column(default=0)
    owner: Mapped[str | None] = mapped_column(String(80), nullable=True)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    error: Mapped[str | None] = mapped_column(String(100), nullable=True)
    __table_args__ = (Index("ix_jobs_schedule", "status", "next_attempt_at"),)


class InvestigationRun(Identity, Base):
    __tablename__ = "investigation_runs"
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    claim_version: Mapped[int]
    workflow_version: Mapped[str] = mapped_column(default="1.0.0")
    status: Mapped[str] = mapped_column(default="RUNNING")
    mode: Mapped[str] = mapped_column(default="fixture")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (UniqueConstraint("incident_id", "claim_version"),)


class Evidence(Identity, Base):
    __tablename__ = "evidence_items"
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("investigation_runs.id"))
    source: Mapped[str] = mapped_column(String(100))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    data: Mapped[dict] = mapped_column(JSON)


class Report(Identity, Base):
    __tablename__ = "reports"
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), unique=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("investigation_runs.id"))
    data: Mapped[dict] = mapped_column(JSON)


class Audit(Identity, Base):
    __tablename__ = "audit_events"
    incident_id: Mapped[str | None] = mapped_column(ForeignKey("incidents.id"), nullable=True, index=True)
    actor: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(100))
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class Usage(Identity, Base):
    __tablename__ = "model_usage"
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    provider: Mapped[str] = mapped_column(default="openai")
    model: Mapped[str]
    status: Mapped[str] = mapped_column(default="RESERVED")
    tokens: Mapped[int | None] = mapped_column(nullable=True)


class RateLimit(Base):
    __tablename__ = "rate_limits"
    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    window: Mapped[int]
    count: Mapped[int] = mapped_column(default=0)


class WebhookReplay(Base):
    __tablename__ = "webhook_replays"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
