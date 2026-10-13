from datetime import datetime, timedelta, timezone
import httpx
import pytest
from app.agents.routing import AgentOpsBridge, InferenceRequest, AIUnavailable, CachedPolicy, safe_fallback
from .test_studio import validate


def request():
    return InferenceRequest(
        environment="staging",
        allowed_regions=["eu"],
        routing_policy_version="policy-2026-10-v1",
        correlation_id="test-correlation",
        trace_id="test-trace",
        operation_id="test-operation",
        mode="LIVE_MODEL_AUTHENTICATED",
    )


def test_shared_inference_contract():
    validate("inference-request", request().model_dump())


@pytest.mark.parametrize(
    "response,code",
    [
        (httpx.Response(403), "POLICY_BLOCKED"),
        (httpx.Response(503), "AI_UNAVAILABLE"),
        (httpx.Response(200, json=[]), "POLICY_BLOCKED"),
        (httpx.Response(200, content=b"x" * 16385), "POLICY_BLOCKED"),
        (httpx.Response(200, content=b"invalid JSON"), "AI_UNAVAILABLE"),
        (httpx.Response(200, json={"policy_version": "different"}), "POLICY_BLOCKED"),
        (
            httpx.Response(
                200,
                json={
                    "policy_version": "policy-2026-10-v1",
                    "live_inference_enabled": False,
                    "catalog_kind": "SYNTHETIC",
                },
            ),
            "AI_UNAVAILABLE",
        ),
        (
            httpx.Response(200, json={"policy_version": "policy-2026-10-v1", "live_inference_enabled": True}),
            "POLICY_BLOCKED",
        ),
    ],
)
async def test_agentops_unavailable_or_unapproved_never_calls_provider(response, code):
    calls = []

    def handler(req):
        calls.append(req)
        return response

    bridge = AgentOpsBridge(
        "https://agentops.example.test/api/projects/agentops",
        "synthetic-test-token",
        httpx.MockTransport(handler),
    )
    with pytest.raises(AIUnavailable) as error:
        await bridge.require_live(request())
    assert error.value.code == code
    assert len(calls) == 1 and calls[0].method == "GET"
    assert calls[0].url.path.endswith("/policy")


async def test_control_plane_timeout_fails_closed():
    def handler(req):
        raise httpx.ReadTimeout("synthetic timeout")

    with pytest.raises(AIUnavailable, match="AI_UNAVAILABLE"):
        await AgentOpsBridge(
            "https://agentops.example.test", "test", httpx.MockTransport(handler)
        ).require_live(request())


@pytest.mark.parametrize(
    "hours,environment,code",
    [
        (1, "staging", "AI_UNAVAILABLE"),
        (-1, "staging", "POLICY_BLOCKED"),
        (1, "production", "POLICY_BLOCKED"),
    ],
)
def test_cached_policy_scope_expiry_and_central_quota(hours, environment, code):
    policy = CachedPolicy(
        application_id="resolveai",
        environment=environment,
        policy_version="policy-2026-10-v1",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=hours),
    )
    fallback = safe_fallback(policy, request())
    assert fallback["code"] == code
    assert not fallback["billable_inference_allowed"]
    assert not fallback["business_action_completed"]


@pytest.mark.parametrize(
    "url", ["http://example.test", "https://user:pass@example.test", "https://example.test/?token=secret"]
)
def test_operator_endpoint_boundary(url):
    with pytest.raises(AIUnavailable):
        AgentOpsBridge(url, "test")
