"""Frozen upstream fixtures and semantic validation, never a relaxed project copy."""

import hashlib
import json
from pathlib import Path

import pytest
from ecosystem_contracts import ContractError, SchemaRegistry

VENDOR = Path("tests/vendor")
CONTRACTS = SchemaRegistry(Path("contracts/ecosystem-v1"))
CASES = sorted((VENDOR / "examples/valid").glob("*.json"))


@pytest.mark.parametrize("path", CASES, ids=lambda p: p.stem)
def test_frozen_valid_and_invalid_contract_fixtures(path):
    CONTRACTS.validate(path.stem, json.loads(path.read_text()))
    invalid = VENDOR / "examples/invalid" / path.name
    with pytest.raises(ContractError):
        CONTRACTS.validate(path.stem, json.loads(invalid.read_text()))


@pytest.mark.parametrize("path", sorted((VENDOR / "examples/errors").glob("*.json")), ids=lambda p: p.stem)
def test_frozen_error_fixtures(path):
    CONTRACTS.validate("error", json.loads(path.read_text()))


def test_upstream_validator_and_examples_keep_exact_release_bytes():
    pinned = json.loads((VENDOR / "contracts-source.json").read_text())
    manifest = json.loads(Path("contracts/ecosystem-v1/contracts-manifest.json").read_text())
    assert pinned["contract_version"] == manifest["contract_version"] == "1.0.0"
    assert len(CASES) == 21
    for name, record in pinned["files"].items():
        assert hashlib.sha256((VENDOR / name).read_bytes()).hexdigest() == record["sha256"]
        if record["source"] in manifest["files"]:
            assert record["sha256"] == manifest["files"][record["source"]]


def test_canonical_datetime_format_validation_is_active():
    # JSON Schema format support is optional without the SDK's pinned dependency.
    # A regex-shaped but impossible date must fail in a fresh installed checkout.
    value = json.loads((VENDOR / "examples/valid/simulation-event.json").read_text())
    value["occurred_at"] = "2026-99-99T99:99:99Z"
    with pytest.raises(ContractError):
        CONTRACTS.validate("simulation-event", value)
