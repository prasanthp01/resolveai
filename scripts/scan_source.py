"""Small source/history hygiene gate; not a comprehensive secret scanner."""

import re
import subprocess
from pathlib import Path

patterns = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"(?<![\w-])sk-[A-Za-z0-9]{30,}"),
]
paths = subprocess.check_output(["git", "ls-files"], text=True).splitlines()
violations = []
for path in paths:
    p = Path(path)
    if p.name.startswith(".env") and p.name != ".env.example":
        violations.append(path + ": environment file tracked")
    if any(part in (".venv", "node_modules") for part in p.parts):
        violations.append(path + ": dependency directory tracked")
    if not p.is_file():
        continue
    if p.suffix in (".png", ".jpg", ".gif", ".woff2"):
        continue
    text = p.read_text(errors="replace")
    if any(pattern.search(text) for pattern in patterns):
        violations.append(path + ": credential-like content")
    if p.name != "scan_source.py" and re.search(r"/Users/[^/]+/|/root/\.ssh", text):
        violations.append(path + ": private infrastructure path/address")
for commit in subprocess.check_output(["git", "rev-list", "--all"], text=True).splitlines():
    patch = subprocess.check_output(
        ["git", "show", "--format=", "--no-ext-diff", commit], text=True, errors="replace"
    )
    if any(pattern.search(patch) for pattern in patterns):
        violations.append(commit + ": credential-like history content")
if violations:
    raise SystemExit("\n".join(violations))
print(f"Checked {len(paths)} tracked paths and reachable history for known credential patterns; no findings.")
