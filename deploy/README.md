# Publicação na VPS

Tudo roda em Docker, em três serviços:

| Serviço | O que é | Exposto à internet |
| --- | --- | --- |
| `caddy` | Proxy. Pede e renova o certificado HTTPS sozinho | Sim (80 e 443) |
| `app` | API em Node, que também entrega o front compilado | Não |
| `db` | PostgreSQL 17 | Não |

Os dados ficam em volumes do Docker (`pilates_db-data`, `pilates_uploads`), fora das imagens:
publicar uma versão nova não toca neles. As migrações do banco rodam sozinhas quando a `app` sobe.

> **Estado (12/11/2026):** no ar em `https://app.pilatesbyriven.com`, com
> certificado HTTPS emitido; publicação, backup, restauração (ensaio com marcador) e cron diário
> foram testados lá. Para publicar uma versão nova: `deploy/publish.sh pilates-vps`.
> A conta admin (`contacto@pilatesbyriven.com`) foi criada; a senha inicial está em
> `ADMIN_PASSWORD` no `/opt/pilates/.env` até ser trocada no app.
>
> Conferência rápida de um endereço publicado: `node e2e/smoke.mjs https://SEU-DOMINIO`.

## 1. O que é preciso

- VPS com Ubuntu 22.04 ou 24.04, **2 GB de RAM** (a imagem é construída na própria VPS;
  com 1 GB, crie 2 GB de swap antes) e uns 20 GB de disco.
- Um domínio ou subdomínio com registro **A** apontando para o IP da VPS
  (ex.: `app.pilatesbyriven.com`). Sem isso o certificado HTTPS não sai.
- Acesso SSH à VPS.

## 2. Preparar a VPS (uma vez)

Na VPS:

```bash
# Docker (script oficial) e firewall
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER        # saia e entre de novo no SSH depois deste comando
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443 && sudo ufw enable

# Pasta do app
sudo mkdir -p /opt/pilates /var/backups/pilates
sudo chown $USER: /opt/pilates /var/backups/pilates
```

Crie o arquivo de ambiente `/opt/pilates/.env` a partir de [`.env.example`](.env.example):

```bash
nano /opt/pilates/.env      # cole o conteúdo de deploy/.env.example e preencha
chmod 600 /opt/pilates/.env
```

Para gerar as quatro chaves: `openssl rand -hex 24` (DB_PASSWORD), `openssl rand -hex 48` (JWT_SECRET),
`openssl rand -base64 32` (INTAKE_KEY), `openssl rand -hex 12` (ADMIN_PASSWORD) — ou, depois da
primeira publicação, `/opt/pilates/app/deploy/gen-secrets.sh`.

**Guarde a `INTAKE_KEY` também fora da VPS** (gerenciador de senhas). Ela cifra as respostas
clínicas; se for perdida, essas respostas não podem mais ser lidas, nem a partir de um backup.

## 3. Publicar

Na sua máquina, no Git Bash, na pasta do projeto, com tudo commitado:

```bash
deploy/publish.sh usuario@ip-da-vps
```

O script envia o último commit, constrói a imagem, faz backup do banco (se já houver um),
troca a versão e espera a aplicação responder. Se a construção falhar, a versão no ar não é tocada.

**Só na primeira vez**, crie a conta de administração, o catálogo e os grupos iniciais:

```bash
ssh usuario@ip-da-vps
/opt/pilates/app/deploy/compose.sh exec app node src/seed.js
```

Depois abra `https://SEU-DOMINIO`, entre com `ADMIN_EMAIL` / `ADMIN_PASSWORD` e troque a senha em
**Cuenta**. O primeiro acesso pode levar alguns segundos enquanto o Caddy obtém o certificado.

## 4. Backups

`backup.sh` gera um dump do banco e um `.tar.gz` dos comprovantes em `/var/backups/pilates`
e apaga os com mais de 14 dias. Agende para todo dia (`crontab -e` na VPS):

```cron
0 9 * * * /opt/pilates/app/deploy/backup.sh >> /var/backups/pilates/backup.log 2>&1
```

(09:00 UTC = 03:00 na Costa Rica, se a VPS estiver em UTC.)

Um backup que só existe na própria VPS se perde junto com ela. Copie para fora regularmente —
por exemplo, da sua máquina:

```bash
scp "usuario@ip-da-vps:/var/backups/pilates/*-$(date +%Y%m%d)-*" ./backups/
```

Os dumps contêm dados pessoais das clientas (as respostas clínicas vão cifradas, o resto não):
guarde-os em local protegido.

## 5. Restaurar

```bash
/opt/pilates/app/deploy/restore.sh /var/backups/pilates/db-AAAAMMDD-HHMMSS.dump /var/backups/pilates/uploads-AAAAMMDD-HHMMSS.tar.gz
```

Pede confirmação, guarda um backup do estado atual, para a aplicação, substitui o banco
(e os comprovantes, se o segundo arquivo for informado) e sobe de novo.

**Ensaio recomendado antes de ter dados reais:** crie uma clienta de teste, rode `backup.sh`,
apague a clienta, rode `restore.sh` com o backup e confira que ela voltou.

## 6. Dia a dia

```bash
cd /opt/pilates/app/deploy
./compose.sh ps                      # estado dos três serviços
./compose.sh logs -f --tail 100 app  # log da aplicação
./compose.sh logs --tail 50 caddy    # log do proxy / certificado
./compose.sh restart app
./compose.sh exec db psql -U riven pilates
```

**Voltar para a versão anterior do código** (a pasta anterior fica em `app.prev`):

```bash
cd /opt/pilates && mv app app.bad && mv app.prev app && app/deploy/compose.sh up -d --build
```

Isso volta o código, não o banco. Se a versão nova tiver aplicado uma migração, restaure também
o backup feito automaticamente antes da publicação.

## 7. Confirmação de e-mail e entrada com Google

As duas coisas ficam desligadas até serem configuradas no `/opt/pilates/.env`
(modelo em [`.env.example`](.env.example)). Depois de editar: `./compose.sh up -d app`.

**Confirmação de e-mail.** Com `SMTP_HOST` preenchido, quem se cadastra recebe um código de
6 dígitos e só vira clienta (com ficha e número PR) depois de confirmá-lo. Cadastros não
confirmados são apagados em 48 horas. Para testar o envio:

```bash
./compose.sh exec app node src/mail-test.js seu-email@exemplo.com
```

**Entrar com Google.** Em [console.cloud.google.com](https://console.cloud.google.com):
APIs e serviços → Tela de consentimento OAuth (tipo Externo, publicar) → Credenciais →
Criar credenciais → ID do cliente OAuth → Aplicativo da Web → em "Origens JavaScript autorizadas",
`https://app.pilatesbyriven.com`. Copie o ID do cliente para `GOOGLE_CLIENT_ID`.
O botão funciona no navegador; dentro do app de iPhone (WebView) o Google bloqueia esse fluxo
e será preciso o plugin nativo — e a Apple exige oferecer também "Iniciar sesión con Apple".

## 8. Antes de divulgar o endereço

- [ ] Login de admin funciona e a senha inicial foi trocada.
- [ ] `ADMIN_PASSWORD` removida do `/opt/pilates/.env` depois da troca (não é mais usada).
- [ ] `INTAKE_KEY` guardada fora da VPS.
- [ ] Cron de backup criado e um ensaio de restauração feito.
- [ ] Em **Ajustes**: WhatsApp do estúdio, número e nome do SINPE, regras de cancelamento.
- [ ] Grupos e preços reais conferidos (o `seed` cria os do documento de requisitos).
- [ ] Textos de consentimento e privacidade revisados por advogado da Costa Rica (hoje são rascunho).
- [ ] Decidido o que fazer com os dados do sistema antigo, se houver.
