"""Reject edits/deletions of snapshots already present in a comparison commit."""

import subprocess
import sys
from pathlib import Path

base = sys.argv[1] if len(sys.argv) > 1 else "HEAD"
paths = subprocess.check_output(
    ["git", "ls-tree", "-r", "--name-only", base, "architecture/versions/"], text=True
).splitlines()
for p in paths:
    original = subprocess.check_output(["git", "show", f"{base}:{p}"])
    assert Path(p).is_file() and Path(p).read_bytes() == original, (
        f"Published architecture snapshot changed: {p}"
    )
print(f"{len(paths)} prior architecture snapshot(s) preserved.")
