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

Cobrem: cadastro e ID de alumna, login e sessões, permissões por papel, último cupo com solicitações
simultâneas, duplo toque, lista de espera, cancelamento tardio, asistencia, duplicados por WhatsApp,
geração de sessões no fuso da Costa Rica, mudança de série e exclusão de conta.

## Estrutura

```
server/
  migrations/         SQL versionado (001 núcleo, 002 catálogo/pagamentos)
  src/routes/         auth, client (clienta), admin (painel)
  src/services/       reservas (trava de cupo), sessões, ajustes
  test/               testes de integração
src/
  ui/                 design system (botões, cartões, folha modal, toasts)
  app/Shell.jsx       barra lateral (computador) e barra inferior (celular)
  screens/admin/      Inicio, Agenda, Reservas, Clientas, Ajustes
  screens/client/     Inicio, Reservar, Mis clases, Perfil
```

## Estado das fases

| Fase | Conteúdo | Estado |
|---|---|---|
| 1 | PostgreSQL, modelo de dados, autenticação e papéis, design system, agenda, reservas, fichas | Feita |
| 2 | Pacotes, renovações, pagamentos, Caja e fundo Lindora, exportação | Pendente (tabelas já criadas) |
| 3 | Formulário clínico e consentimento, SINPE e Compra Click | Pendente |
| 4 | Simulação de usuários, deploy na VPS (Docker, nginx, backup), app iPhone | Pendente |

`deploy.sh` e `nginx.conf` são do app antigo (site estático) e serão refeitos na Fase 4.
