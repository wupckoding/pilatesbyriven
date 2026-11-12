#!/usr/bin/env bash
# Backup do banco e dos comprovantes. Roda na VPS (manual ou pelo cron).
#   ./backup.sh
# Gera em $BACKUP_DIR:  db-AAAAMMDD-HHMMSS.dump  e  uploads-AAAAMMDD-HHMMSS.tar.gz
# e apaga os que têm mais de $KEEP_DAYS dias.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$here/../../.env}"
# BACKUP_DIR e KEEP_DAYS podem vir do .env.
if [ -f "$ENV_FILE" ]; then
  BACKUP_DIR="${BACKUP_DIR:-$(grep -E '^BACKUP_DIR=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)}"
  KEEP_DAYS="${KEEP_DAYS:-$(grep -E '^KEEP_DAYS=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)}"
fi
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pilates}"
KEEP_DAYS="${KEEP_DAYS:-14}"

umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
db_file="$BACKUP_DIR/db-$stamp.dump"
up_file="$BACKUP_DIR/uploads-$stamp.tar.gz"

# Se algo falhar no meio, não deixa um arquivo pela metade com cara de backup bom.
trap 'rm -f "$db_file.tmp" "$up_file.tmp"' EXIT

"$here/compose.sh" exec -T db pg_dump -U riven -d pilates --format=custom > "$db_file.tmp"
# Confere que o arquivo é um dump legível antes de aceitá-lo.
"$here/compose.sh" exec -T db pg_restore --list < "$db_file.tmp" > /dev/null
mv "$db_file.tmp" "$db_file"

"$here/compose.sh" exec -T app tar -czf - -C /data uploads > "$up_file.tmp"
mv "$up_file.tmp" "$up_file"

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime "+$KEEP_DAYS" -delete

echo "backup ok: $db_file ($(du -h "$db_file" | cut -f1)) · $up_file ($(du -h "$up_file" | cut -f1))"
