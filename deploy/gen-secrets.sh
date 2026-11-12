#!/usr/bin/env bash
# Imprime valores novos para o .env de produção. Rode na VPS e cole no /opt/pilates/.env.
set -euo pipefail
echo "DB_PASSWORD=$(openssl rand -hex 24)"
echo "JWT_SECRET=$(openssl rand -hex 48)"
echo "INTAKE_KEY=$(openssl rand -base64 32)"
echo "ADMIN_PASSWORD=$(openssl rand -hex 12)"
