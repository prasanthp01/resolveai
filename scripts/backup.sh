#!/bin/sh
# Run from the repository root. The output directory must be private and off Git.
set -eu
: "${BACKUP_DIR:?Set a private backup directory}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
umask 077
docker compose --env-file deploy/private.env -f deploy/compose.private.yaml exec -T db pg_dump -U resolveai_migrator -d resolveai -Fc > "$BACKUP_DIR/resolveai-$stamp.dump"
# Encryption and off-host transfer are operator-configured; see docs/OPERATIONS.md.
