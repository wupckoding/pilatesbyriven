#!/bin/bash
# ==============================================
# Deploy Script — Pilates by Riven
# ==============================================
# Uso: ./deploy.sh usuario@ip-do-servidor
#
# Pré-requisitos no servidor:
#   - nginx instalado
#   - pasta /var/www/pilates-by-riven criada
# ==============================================

set -e

SERVER=${1:?"❌ Uso: ./deploy.sh usuario@ip-do-servidor"}

echo "🔨 Fazendo build de produção..."
npm run build

echo "📦 Enviando arquivos para o servidor..."
rsync -avz --delete dist/ "$SERVER:/var/www/pilates-by-riven/"

echo "📋 Copiando config nginx..."
scp nginx.conf "$SERVER:/tmp/pilates-by-riven.conf"
ssh "$SERVER" "sudo mv /tmp/pilates-by-riven.conf /etc/nginx/sites-available/pilates-by-riven && \
               sudo ln -sf /etc/nginx/sites-available/pilates-by-riven /etc/nginx/sites-enabled/ && \
               sudo nginx -t && sudo systemctl reload nginx"

echo ""
echo "✅ Deploy concluído!"
echo "🌐 Acesse: http://\$(echo $SERVER | cut -d@ -f2)"
echo ""
echo "📌 Próximos passos:"
echo "   1. Configure o domínio DNS apontando para o IP do servidor"
echo "   2. Instale SSL: sudo certbot --nginx -d seu-dominio.com.br"
echo "   3. Atualize server_name no nginx.conf com seu domínio real"
