-- Pilates by Riven — núcleo: cuentas, clientas, agenda, reservas, auditoría
create extension if not exists citext;

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  password_hash text not null,
  role          text not null default 'client' check (role in ('admin','instructor','client')),
  full_name     text not null default '',
  token_version integer not null default 0,
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ID de alumna "PR 0001": la secuencia nunca reutiliza un número.
create sequence client_number_seq start 1;

create table class_groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  modality      text not null default 'reformer' check (modality in ('reformer','cadillac','mat')),
  kind          text not null default 'group' check (kind in ('group','duo','private','trial')),
  weekday       smallint not null check (weekday between 0 and 6),   -- 0 = domingo
  start_time    time not null,
  duration_min  integer not null default 60 check (duration_min between 15 and 240),
  capacity      integer not null default 3 check (capacity between 1 and 50),
  instructor_id uuid references users(id) on delete set null,
  open_booking  boolean not null default true,   -- false: solo administración asigna cupos
  is_active     boolean not null default true,
  starts_on     date not null default current_date,
  ends_on       date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table clients (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid unique references users(id) on delete set null,
  student_number     integer not null unique default nextval('client_number_seq'),
  full_name          text not null,
  whatsapp           text,                      -- E.164, p. ej. +50688887777
  email              citext,
  birth_date         date,
  status             text not null default 'interested'
                       check (status in ('interested','trial_scheduled','active','paused','inactive')),
  source             text not null default 'other'
                       check (source in ('instagram','whatsapp','referral','form','app','other')),
  preferred_modality text check (preferred_modality in ('reformer','cadillac','mat')),
  preferred_days     text not null default '',
  internal_notes     text not null default '',  -- solo personal autorizado
  emergency_name     text not null default '',
  emergency_phone    text not null default '',
  last_contact_at    timestamptz,
  next_followup_on   date,
  intake_status      text not null default 'pending'
                       check (intake_status in ('pending','completed','needs_review','needs_update')),
  home_group_id      uuid references class_groups(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz
);
create index clients_whatsapp_idx on clients (whatsapp) where whatsapp is not null;
create index clients_name_idx on clients (lower(full_name));
create index clients_status_idx on clients (status) where archived_at is null;

create table class_sessions (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid references class_groups(id) on delete set null,
  original_date date,                 -- fecha que generó la serie; no cambia al mover la sesión
  local_date    date not null,        -- fecha en Costa Rica
  local_time    time not null,
  starts_at     timestamptz not null,
  name          text not null,
  modality      text not null check (modality in ('reformer','cadillac','mat')),
  kind          text not null check (kind in ('group','duo','private','trial')),
  duration_min  integer not null,
  capacity      integer not null check (capacity between 1 and 50),
  instructor_id uuid references users(id) on delete set null,
  open_booking  boolean not null default true,
  status        text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  cancel_reason text not null default '',
  is_override   boolean not null default false,  -- cambio puntual: la serie ya no la sobrescribe
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (group_id, original_date)
);
create index class_sessions_date_idx on class_sessions (local_date, local_time);

create table bookings (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references class_sessions(id) on delete restrict,
  client_id           uuid not null references clients(id) on delete restrict,
  status              text not null default 'pending'
                        check (status in ('pending','confirmed','waitlisted','cancelled','rescheduled')),
  attendance          text check (attendance in ('attended','absent','cancelled_notice','cancelled_late','made_up')),
  rescheduled_from_id uuid references bookings(id) on delete set null,
  reason              text not null default '',
  offered_at          timestamptz,           -- lista de espera: cuándo se le ofreció el cupo
  created_by          uuid references users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  cancelled_at        timestamptz
);
-- Una clienta solo puede tener una reserva viva por sesión (protege contra doble toque).
create unique index bookings_live_unique on bookings (session_id, client_id)
  where status in ('pending','confirmed','waitlisted');
create index bookings_session_idx on bookings (session_id, status);
create index bookings_client_idx on bookings (client_id, created_at desc);

create table schedule_blocks (
  id         uuid primary key default gen_random_uuid(),
  starts_on  date not null,
  ends_on    date not null,
  start_time time,
  end_time   time,
  reason     text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table audit_log (
  id          bigserial primary key,
  actor_id    uuid references users(id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index audit_entity_idx on audit_log (entity, entity_id, created_at desc);

create table idempotency_keys (
  key        text primary key,
  user_id    uuid references users(id) on delete cascade,
  response   jsonb not null,
  created_at timestamptz not null default now()
);
