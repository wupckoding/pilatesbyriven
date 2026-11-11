-- Fase 2: pagos en otra moneda que la del paquete, idempotencia y trazabilidad de paquetes.

-- Un SINPE en colones puede pagar un paquete en dólares: se guarda el tipo de cambio usado
-- y cuánto se aplicó al saldo del paquete en SU moneda. Caja siempre suma el dinero real (amount_cents).
alter table payments add column fx_rate numeric(12,4);          -- colones por dólar
alter table payments add column applied_cents integer not null default 0 check (applied_cents >= 0);
alter table payments add column idempotency_key text unique;    -- repetir el mismo registro no duplica el cobro
alter table payments add column reject_reason text not null default '';

alter table client_packages add column activated_at timestamptz;
alter table client_packages add column activated_by uuid references users(id) on delete set null;
alter table client_packages add column exception_reason text not null default '';  -- activado sin pago completo
alter table client_packages add column cancel_reason text not null default '';
alter table client_packages add column extension_reason text not null default '';

create index client_packages_status_idx on client_packages (status, expires_on);
create index payments_package_idx on payments (package_id) where package_id is not null;
create index payments_status_idx on payments (status, received_on);
create index expenses_date_idx on expenses (spent_on);
create index savings_date_idx on savings_transfers (transferred_on);
