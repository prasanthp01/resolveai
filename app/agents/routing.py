"""Provider-neutral request boundary and fail-closed AgentOps control-plane adapter.

The observed AgentOps 1.1 gateway accepts only synthetic tasks. It must never be
misrepresented as a live incident-report provider. Private local inference remains
an explicitly configured OpenAI-compatible adapter with the existing DB budget.
"""

from datetime import datetime, timezone
import json
from typing import Literal
from urllib.parse import urlsplit
import httpx
from pydantic import BaseModel, ConfigDict, Field


class AIUnavailable(ValueError):
    def __init__(self, code="AI_UNAVAILABLE", reason="Model service unavailable"):
        self.code, self.reason = code, reason
        super().__init__(code)


class InferenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["1.0"] = "1.0"
    application_id: str = "resolveai"
    environment: Literal["test", "development", "staging", "production"]
    tenant_id: str = "single-tenant"
    risk_class: Literal["HIGH"] = "HIGH"
    max_input_tokens: int = Field(default=16000, ge=1, le=131072)
    max_output_tokens: int = Field(default=1500, ge=1, le=32768)
    trace_id: str
    context_refs: list[str] = Field(default_factory=list, max_length=16)
    extensions: dict = Field(default_factory=dict, max_length=16)
    task_type: str = "incident-investigation"
    required_capabilities: list[str] = Field(default_factory=lambda: ["TEXT", "STRUCTURED_OUTPUT"])
    data_classification: Literal["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"] = "INTERNAL"
    allowed_regions: list[str]
    latency_deadline_ms: int = Field(default=5000, ge=1, le=25000)
    max_cost: float = Field(default=0, ge=0)
    currency: Literal["USD"] = "USD"
    routing_policy_version: str
    correlation_id: str
    operation_id: str
    mode: Literal["SANDBOX_DETERMINISTIC", "LIVE_MODEL_AUTHENTICATED"]


class CachedPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: str
    environment: str
    policy_version: str
    expires_at: datetime
    budget_authority: Literal["central"] = "central"


def safe_fallback(policy: CachedPolicy | None, request: InferenceRequest):
    valid = bool(
        policy
        and policy.expires_at.tzinfo
        and policy.expires_at > datetime.now(timezone.utc)
        and policy.application_id == request.application_id
        and policy.environment == request.environment
        and policy.policy_version == request.routing_policy_version
    )
    return {
        "code": "AI_UNAVAILABLE" if valid else "POLICY_BLOCKED",
        "reason": "Central budget authority is unavailable; local billable calls are forbidden."
        if valid
        else "Approved policy is missing, expired or outside this request scope.",
        "model_fallback": "none eligible",
        "workflow_fallback": "deterministic diagnostics and human review",
        "billable_inference_allowed": False,
        "business_action_completed": False,
    }


def endpoint(base_url):
    parsed = urlsplit(base_url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise AIUnavailable(
            "POLICY_BLOCKED", "Operator endpoint must be HTTPS without credentials, query or fragment."
        )
    return base_url.rstrip("/")


class AgentOpsBridge:
    def __init__(self, base_url, token, transport=None):
        self.base_url = endpoint(base_url)
        self.token = token
        self.transport = transport

    async def require_live(self, request: InferenceRequest):
        if not self.token:
            raise AIUnavailable("POLICY_BLOCKED", "AgentOps service credential missing")
        try:
            async with httpx.AsyncClient(
                timeout=min(request.latency_deadline_ms / 1000, 5),
                follow_redirects=False,
                trust_env=False,
                transport=self.transport,
            ) as client:
                async with client.stream(
                    "GET", self.base_url + "/policy", headers={"Authorization": "Bearer " + self.token}
                ) as response:
                    if response.status_code in (401, 403):
                        raise AIUnavailable("POLICY_BLOCKED", "AgentOps denied the caller scope")
                    response.raise_for_status()
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > 16384:
                            raise AIUnavailable(
                                "POLICY_BLOCKED", "AgentOps policy exceeds the response limit"
                            )
                policy = json.loads(body)
                if not isinstance(policy, dict):
                    raise AIUnavailable("POLICY_BLOCKED", "AgentOps policy must be a JSON object")
                if policy.get("policy_version") != request.routing_policy_version:
                    raise AIUnavailable("POLICY_BLOCKED", "AgentOps policy version mismatch")
                if not policy.get("live_inference_enabled") or policy.get("catalog_kind") == "SYNTHETIC":
                    raise AIUnavailable(
                        "AI_UNAVAILABLE",
                        "Configured AgentOps exposes synthetic routing only; live incident inference is unavailable",
                    )
                # No released live content/report contract exists yet. Fail closed instead of inventing it.
                raise AIUnavailable(
                    "POLICY_BLOCKED",
                    "Live incident payload contract has not been approved for this gateway version",
                )
        except (httpx.HTTPError, ValueError) as exc:
            if isinstance(exc, AIUnavailable):
                raise
            raise AIUnavailable(
                "AI_UNAVAILABLE", "AgentOps unavailable; no local billable fallback is authorized"
            ) from None
