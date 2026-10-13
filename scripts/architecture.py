"""Architecture consistency gate. Reviewed snapshots are immutable once committed."""

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = [
    "app/**/*.py",
    "web/src/**/*",
    "alembic/versions/*.py",
    "deploy/*",
    "compose.yaml",
    "pyproject.toml",
    "web/package.json",
    "web/vite.config.ts",
    "Dockerfile",
    "web/scripts/*",
    "scripts/**/*.py",
]


def fingerprint():
    files = sorted(
        {
            p
            for pattern in PATTERNS
            for p in ROOT.glob(pattern)
            if p.is_file() and "__pycache__" not in str(p) and p.suffix != ".env"
        }
    )
    return hashlib.sha256(
        b"".join(str(p.relative_to(ROOT)).encode() + b"\0" + p.read_bytes() + b"\0" for p in files)
    ).hexdigest()


def check():
    index = json.loads((ROOT / "architecture/index.json").read_text())
    versions = index["versions"]
    assert len({v["version"] for v in versions}) == len(versions)
    current = json.loads((ROOT / "architecture/versions" / f"{index['current']}.json").read_text())
    assert current["source_fingerprint"] == fingerprint(), (
        "Architecture drift: review changes, add a new versioned snapshot, and regenerate docs."
    )
    for group in ["high_level", "low_level"]:
        for section in current[group]["sections"]:
            for ref in section["code"]:
                path = ROOT / ref["path"]
                assert path.is_file(), f"Missing code reference: {path}"
                if ref["symbol"]:
                    assert ref["symbol"] in path.read_text(), f"Missing symbol: {ref}"
    assert (ROOT / "docs/ARCHITECTURE.md").read_text() == render(current), (
        "Generated architecture documentation is stale"
    )
    print("Architecture fingerprint, code references, version index, and documentation agree.")


def render(data):
    lines = [
        f"# ResolveAI architecture v{data['version']}",
        f"\nApplication v{data['app_version']} · {data['date']} · Source commit `{data['source_commit']}`",
        "\n" + data["summary"],
    ]
    for group, title in [("high_level", "High-level architecture"), ("low_level", "Low-level architecture")]:
        lines.extend(["\n## " + title, "\n```mermaid\n" + data[group]["diagram"] + "\n```"])
        if "public_diagram" in data[group]:
            lines.append("\n```mermaid\n" + data[group]["public_diagram"] + "\n```")
        if "data_diagram" in data[group]:
            lines.append("\n```mermaid\n" + data[group]["data_diagram"] + "\n```")
        for section in data[group]["sections"]:
            lines.extend(
                ["\n### " + section["title"], "\n" + section["summary"]]
                + ["\n" + p for p in section["explanation"]]
            )
            lines.extend(
                ["\n- `" + c["path"] + "` → `" + c["symbol"] + "`: " + c["purpose"] for c in section["code"]]
            )
    for walkthrough in data["walkthroughs"]:
        lines.append("\n## " + walkthrough["title"])
        for i, step in enumerate(walkthrough["steps"], 1):
            lines.append(f"\n{i}. **{step['title']}** — {step['explanation']} (`{step['code']}`)")
    lines.append("\n## Version changes")
    lines.extend(["\n- " + v for v in data["changes"]])
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args()
    if args.render:
        index = json.loads((ROOT / "architecture/index.json").read_text())
        data = json.loads((ROOT / "architecture/versions" / f"{index['current']}.json").read_text())
        (ROOT / "docs/ARCHITECTURE.md").write_text(render(data))
    else:
        check()
