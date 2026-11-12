#!/usr/bin/env bash
# Restaura um backup. SUBSTITUI o banco atual (e os comprovantes, se o .tar.gz for informado).
#   ./restore.sh /var/backups/pilates/db-20261111-030000.dump [/var/backups/pilates/uploads-20261111-030000.tar.gz]
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dump="${1:?uso: ./restore.sh arquivo.dump [uploads.tar.gz]}"
uploads="${2:-}"
[ -f "$dump" ] || { echo "Arquivo não encontrado: $dump" >&2; exit 1; }
[ -z "$uploads" ] || [ -f "$uploads" ] || { echo "Arquivo não encontrado: $uploads" >&2; exit 1; }

# Antes de tocar em qualquer coisa: o arquivo é um dump válido?
"$here/compose.sh" exec -T db pg_restore --list < "$dump" > /dev/null

echo "Isto APAGA o banco atual e o substitui por: $dump"
[ -z "$uploads" ] || echo "e substitui os comprovantes por: $uploads"
read -r -p 'Digite "restaurar" para continuar: ' answer
[ "$answer" = "restaurar" ] || { echo "Cancelado."; exit 1; }

# Guarda o estado atual antes de apagar, por via das dúvidas.
# (SKIP_BACKUP=1 pula este passo, para quando o banco atual está quebrado e nem o backup roda.)
[ "${SKIP_BACKUP:-}" = "1" ] || "$here/backup.sh"

"$here/compose.sh" stop app
"$here/compose.sh" exec -T db dropdb -U riven --if-exists --force pilates
"$here/compose.sh" exec -T db createdb -U riven pilates
"$here/compose.sh" exec -T db pg_restore -U riven -d pilates --no-owner --exit-on-error < "$dump"

if [ -n "$uploads" ]; then
  "$here/compose.sh" run --rm -T --no-deps --entrypoint sh app \
    -c 'find /data/uploads -mindepth 1 -delete && tar -xzf - -C /data' < "$uploads"
fi

"$here/compose.sh" start app
echo "Restaurado. Confira: $here/compose.sh ps"
