-- Fase 3: formulario de admisión con consentimiento, órdenes de la clienta y comprobantes.

-- Cada envío del formulario es un registro propio: las versiones anteriores se conservan.
-- Las respuestas clínicas van cifradas (AES-256-GCM) con una llave que vive fuera de la base.
create table intake_submissions (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete cascade,
  form_version        text not null,
  consent_version     text not null,
  answers_enc         text,                       -- null cuando las respuestas se eliminaron
  needs_review        boolean not null default false,
  reviewed_at         timestamptz,
  reviewed_by         uuid references users(id) on delete set null,
  consent_name        text not null,              -- nombre escrito como aceptación
  consent_accepted_at timestamptz not null default now(),
  submitted_by        uuid references users(id) on delete set null,
  assisted            boolean not null default false,  -- llenado en el estudio con el personal
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  delete_reason       text not null default ''
);
create index intake_client_idx on intake_submissions (client_id, created_at desc);

-- Quién vio o cambió datos sensibles, y cuándo.
create table intake_access_log (
  id            bigserial primary key,
  client_id     uuid not null references clients(id) on delete cascade,
  submission_id uuid references intake_submissions(id) on delete set null,
  actor_id      uuid references users(id) on delete set null,
  action        text not null check (action in ('submit','view','review','request_update','delete')),
  created_at    timestamptz not null default now()
);
create index intake_log_client_idx on intake_access_log (client_id, created_at desc);

-- Órdenes iniciadas por la clienta y enlace de pago de Compra Click asociado a mano.
alter table client_packages add column reference text unique;
alter table client_packages add column payment_link text not null default '';
alter table client_packages add column order_key text unique;   -- doble toque al comprar no duplica la orden
alter table client_packages add column created_by_client boolean not null default false;

-- Comprobante en almacenamiento privado (nunca bajo la carpeta pública).
alter table payments add column proof_mime text;
