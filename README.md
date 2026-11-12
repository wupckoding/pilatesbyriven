# Pilates by Riven

App de reservas e painel de administração do estúdio Pilates by Riven (Escazú, Costa Rica).
A interface é em espanhol; o calendário opera sempre no fuso `America/Costa_Rica`.

## Stack

- **Front:** React 18, Vite 6, Tailwind 3, React Router, TanStack Query, PWA
- **API:** Node 20+, Express 4, PostgreSQL 17, zod, JWT
- **Testes:** `node:test` contra um banco PostgreSQL de teste

## Rodar local

```bash
# 1. Banco de desenvolvimento (cluster próprio na porta 5433)
powershell -File scripts/db-start.ps1

# 2. API (porta 3001) — migra o banco ao iniciar
cd server
npm install
npm run seed:demo     # admin + catálogo + grupos + clientas fictícias
npm run dev

# 3. Front (porta 3000) — /api é redirecionado para a 3001
npm install
npm run dev
```

O login de administração vem de `ADMIN_EMAIL` / `ADMIN_PASSWORD` em `server/.env` (arquivo local, fora do git).
Modelo de configuração: `server/.env.example`.

## Dados sensíveis

- As respostas de saúde do formulário de admissão são criptografadas (AES-256-GCM) com a chave `INTAKE_KEY` de `server/.env`.
  **Guarde uma cópia dessa chave fora do servidor:** sem ela as respostas já salvas não podem ser lidas.
- Comprovantes de pagamento ficam em `server/uploads/` (ou `UPLOADS_DIR`), fora da pasta pública, e só saem por rota de admin.
- O texto da declaração (`CONSENT_TEXT` em `server/src/services/intake.js`) e o aviso de privacidade são rascunhos
  **pendentes de revisão jurídica na Costa Rica**. Ao mudar o texto ou as perguntas, suba `CONSENT_VERSION` / `FORM_VERSION`:
  quem já preencheu passa a "requer atualização".

## Testes

```bash
cd server
npm test
```

São 45 testes. Além de cadastro, permissões, último cupo e fuso horário, cobrem os casos de aceitação do documento
de requisitos: renovação com pagamento parcial confirmada uma única vez, quatro clases e uma reposição,
ausência e cancelamento conforme a regra do pacote, e o fechamento de Caja do exemplo (US$2.400 cobrados,
US$900 de gastos, US$1.500 disponíveis, US$1.200 transferidos). A Fase 3 testa o passo de admissão antes de reservar,
que as respostas clínicas não vazam para ficha, agenda, Caja nem exportações, e o fluxo de ordem com comprovante.

## Testes de interface

```bash
npm run test:e2e
```

Playwright abre o app num navegador real, em computador (1440 px) e em celular (Pixel 7), contra uma API e um banco próprios
(`pilates_e2e`, recriado a cada rodada; portas 3100 e 3101). São 18 cenários em cada tamanho de tela: cadastro e login,
admissão em quatro passos, reservar e cancelar, comprar e subir comprovante, agenda, clientas, pacote com pagamento parcial e
reembolso, Caja, admissão no painel, ajustes e permissões da instrutora. Toda tela é conferida quanto a erro de JavaScript,
estouro de largura e, no celular, botões pequenos demais para o dedo. O relatório com capturas fica em `e2e/report/`.

## Simulação de uso

```bash
cd server
npm run simulate                      # 1000 usuárias virtuais
SIM_USERS=200 SIM_SEED=7 npm run simulate
```

Usa um banco próprio (`pilates_sim`, apagado a cada rodada). Mil clientas virtuais fazem cadastro, admissão, compra,
comprovante, reservas e cancelamentos ao mesmo tempo, com duplo toque em tudo; três sessões de admin verificam pagamentos,
confirmam, movem e cancelam em paralelo; parte das usuárias tenta acessar dados alheios e enviar entradas inválidas.
No fim, 17 regras de negócio são conferidas direto no banco. O último relatório fica em `server/sim/report.md`.

## Estrutura

```
server/
  migrations/         SQL versionado (001 núcleo, 002 catálogo/pagamentos, 003 câmbio e idempotência)
  src/routes/         auth, client (clienta), admin (painel), commerce (pacotes, pagamentos, Caja)
  src/services/       reservas (trava de cupo), pacotes (créditos), sessões, ajustes
  test/               testes de integração
src/
  ui/                 design system (botões, cartões, folha modal, toasts)
  app/Shell.jsx       barra lateral (computador) e barra inferior (celular)
  screens/admin/      Inicio, Agenda, Reservas, Clientas, Paquetes y pagos, Caja, Ajustes
  screens/client/     Inicio, Reservar, Mis clases, Perfil
```

## Estado das fases

| Fase | Conteúdo | Estado |
|---|---|---|
| 1 | PostgreSQL, modelo de dados, autenticação e papéis, design system, agenda, reservas, fichas | Feita |
| 2 | Pacotes e créditos, renovações com retenção de vaga, pagamentos (parcial, por verificar, reembolso, CRC/USD), Caja e fundo Lindora, exportação CSV | Feita |
| 3 | Formulário de admissão e consentimento (respostas criptografadas, acesso só do admin com registro), compra pela clienta, comprovante SINPE, link de Compra Click por ordem | Feita |
| 4 | Simulação de 1000 usuárias e testes de interface (feitos); arquivos de deploy na VPS (escritos, ainda não rodados numa VPS); app iPhone (pendente) | Em andamento |

## Publicação

Docker com três serviços (Caddy com HTTPS automático, app, PostgreSQL), backup e restauração:
o roteiro completo está em [deploy/README.md](deploy/README.md).

Para conferir o app compilado em modo produção antes de publicar (política de segurança do navegador
ativa, service worker instalado):

```bash
npm run build
NODE_ENV=production PORT=3002 node server/src/index.js   # em outro terminal
node e2e/prod-check.mjs
```
