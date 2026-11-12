#!/usr/bin/env bash
# Atalho para "docker compose" com o projeto e o .env certos, de qualquer pasta.
#   ./compose.sh ps          ./compose.sh logs -f app          ./compose.sh up -d --build
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# O .env fica fora da pasta do código (/opt/pilates/.env) para sobreviver a cada publicação.
ENV_FILE="${ENV_FILE:-$here/../../.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Não achei o arquivo de ambiente em $ENV_FILE (veja deploy/.env.example)" >&2
  exit 1
fi
exec docker compose --env-file "$ENV_FILE" -f "$here/docker-compose.yml" "$@"
