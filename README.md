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

## Testes

```bash
cd server
npm test
```

São 34 testes. Além de cadastro, permissões, último cupo e fuso horário, cobrem os casos de aceitação do documento
de requisitos: renovação com pagamento parcial confirmada uma única vez, quatro clases e uma reposição,
ausência e cancelamento conforme a regra do pacote, e o fechamento de Caja do exemplo (US$2.400 cobrados,
US$900 de gastos, US$1.500 disponíveis, US$1.200 transferidos).

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
| 3 | Formulário clínico e consentimento, SINPE e Compra Click | Pendente |
| 4 | Simulação de usuários, deploy na VPS (Docker, nginx, backup), app iPhone | Pendente |

`deploy.sh` e `nginx.conf` são do app antigo (site estático) e serão refeitos na Fase 4.
