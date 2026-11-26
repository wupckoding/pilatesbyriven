-- Anular un pago registrado por error: queda en el historial, pero deja de contar en saldos y Caja.
alter table payments drop constraint payments_status_check;
alter table payments add constraint payments_status_check
  check (status in ('pending','to_verify','verified','rejected','voided'));
alter table payments add column void_reason text not null default '';
alter table payments add column voided_by uuid references users(id) on delete set null;
alter table payments add column voided_at timestamptz;
