-- Verificación de correo al registrarse e inicio de sesión con Google.

alter table users
  add column email_verified_at timestamptz,
  add column google_sub text unique,
  -- WhatsApp escrito al registrarse: la ficha de clienta (y su número PR) se crea al verificar el correo,
  -- así una cuenta falsa nunca llega al panel ni gasta un número.
  add column signup_whatsapp text;

-- Las cuentas que ya existían quedan verificadas.
update users set email_verified_at = now() where email_verified_at is null;

create table email_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  code_hash   text not null,
  attempts    integer not null default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index email_codes_user_idx on email_codes (user_id, created_at desc);
