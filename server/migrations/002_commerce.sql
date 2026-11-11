-- Pilates by Riven — catálogo, paquetes, pagos, gastos y ahorro (se usan desde la Fase 2)
-- Importes siempre en la unidad menor de la moneda (centavos / céntimos) para evitar errores de redondeo.

create table products (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  kind           text not null check (kind in ('trial','single','package')),
  sessions_count integer not null check (sessions_count >= 1),
  price_cents    integer not null check (price_cents >= 0),
  currency       text not null default 'USD' check (currency in ('USD','CRC')),
  validity_days  integer not null default 30 check (validity_days >= 1),
  modalities     text[] not null default '{reformer,cadillac,mat}',
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Cada compra guarda su propio precio y vigencia: cambiar el catálogo no altera ventas pasadas.
create table client_packages (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete restrict,
  product_id     uuid references products(id) on delete set null,
  name           text not null,
  kind           text not null check (kind in ('trial','single','package')),
  price_cents    integer not null check (price_cents >= 0),
  currency       text not null check (currency in ('USD','CRC')),
  sessions_total integer not null check (sessions_total >= 1),
  starts_on      date not null,
  expires_on     date not null,
  status         text not null default 'pending_payment'
                   check (status in ('proposed','pending_payment','active','expired','cancelled')),
  hold_until     date,
  group_id       uuid references class_groups(id) on delete set null,
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index client_packages_client_idx on client_packages (client_id, starts_on desc);

alter table bookings add column package_id uuid references client_packages(id) on delete set null;
create index bookings_package_idx on bookings (package_id) where package_id is not null;

create table payments (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references clients(id) on delete restrict,
  package_id         uuid references client_packages(id) on delete set null,
  booking_id         uuid references bookings(id) on delete set null,
  kind               text not null default 'payment' check (kind in ('payment','refund','adjustment','void')),
  related_payment_id uuid references payments(id) on delete set null,
  amount_cents       integer not null check (amount_cents > 0),
  currency           text not null check (currency in ('USD','CRC')),
  method             text not null check (method in ('sinpe','card','cash','transfer','other')),
  reference          text not null default '',
  status             text not null default 'to_verify' check (status in ('pending','to_verify','verified','rejected')),
  received_on        date,           -- fecha real en que entró el dinero
  verified_by        uuid references users(id) on delete set null,
  verified_at        timestamptz,
  proof_path         text,           -- comprobante en almacenamiento privado
  note               text not null default '',
  created_by         uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index payments_client_idx on payments (client_id, created_at desc);
create index payments_received_idx on payments (received_on) where status = 'verified';

create table expenses (
  id           uuid primary key default gen_random_uuid(),
  spent_on     date not null,
  category     text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency     text not null check (currency in ('USD','CRC')),
  note         text not null default '',
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Transferencias reales al fondo de Lindora: no son gastos del estudio.
create table savings_transfers (
  id             uuid primary key default gen_random_uuid(),
  transferred_on date not null,
  amount_cents   integer not null check (amount_cents > 0),
  currency       text not null check (currency in ('USD','CRC')),
  note           text not null default '',
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table exchange_rates (
  id            uuid primary key default gen_random_uuid(),
  rate_date     date not null unique,
  crc_per_usd   numeric(12,4) not null check (crc_per_usd > 0),
  created_at    timestamptz not null default now()
);
