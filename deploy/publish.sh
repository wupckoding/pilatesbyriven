#!/usr/bin/env bash
# Publica a versão commitada (HEAD) na VPS. Roda na SUA máquina (Git Bash), não na VPS.
#   deploy/publish.sh usuario@servidor
#   SERVICES="db app" deploy/publish.sh usuario@servidor    (sem o proxy, antes de o DNS apontar)
#
# O que faz, nesta ordem:
#   1. envia o código do último commit para /opt/pilates/app.new
#   2. constrói a imagem nova (se falhar aqui, a versão no ar não é tocada)
#   3. faz backup do banco, se já houver um rodando
#   4. troca a pasta do código (a anterior fica em app.prev) e sobe os serviços
#   5. espera a aplicação responder
set -euo pipefail
target="${1:?uso: deploy/publish.sh usuario@servidor}"
REMOTE_DIR="${REMOTE_DIR:-/opt/pilates}"
root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"

if [ -n "$(git -C "$root" status --porcelain)" ]; then
  echo "Há alterações sem commit. Só o que está commitado é publicado — faça o commit antes." >&2
  exit 1
fi
rev="$(git -C "$root" rev-parse --short HEAD)"
echo "Publicando $rev em $target:$REMOTE_DIR"

git -C "$root" archive --format=tar.gz HEAD | ssh "$target" \
  "set -e; test -f '$REMOTE_DIR/.env' || { echo 'Falta $REMOTE_DIR/.env (veja deploy/.env.example)' >&2; exit 1; }
   rm -rf '$REMOTE_DIR/app.new'; mkdir -p '$REMOTE_DIR/app.new'; tar -xzf - -C '$REMOTE_DIR/app.new'"

ssh "$target" "REMOTE_DIR='$REMOTE_DIR' REV='$rev' SERVICES='${SERVICES:-}' bash -s" <<'REMOTE'
set -euo pipefail
cd "$REMOTE_DIR"
chmod +x app.new/deploy/*.sh

echo "== construindo a imagem =="
app.new/deploy/compose.sh build app < /dev/null

if [ -d app ] && app/deploy/compose.sh ps --status running --services < /dev/null 2>/dev/null | grep -qx db; then
  echo "== backup antes de trocar de versão =="
  app/deploy/backup.sh < /dev/null
fi

rm -rf app.prev
if [ -d app ]; then mv app app.prev; fi
mv app.new app
echo "$REV" > app/REVISION

echo "== subindo =="
# SERVICES limita o que sobe (ex.: "db app" enquanto o DNS do domínio ainda não aponta para cá).
app/deploy/compose.sh up -d --remove-orphans $SERVICES < /dev/null

echo "== esperando a aplicação responder =="
for i in $(seq 1 30); do
  if app/deploy/compose.sh exec -T app node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" < /dev/null 2>/dev/null; then
    echo "ok: versão $REV no ar"
    exit 0
  fi
  sleep 2
done
echo "A aplicação não respondeu em 60 s. Veja: $REMOTE_DIR/app/deploy/compose.sh logs --tail 100 app" >&2
exit 1
REMOTE
