-- Iniciar sesión con Apple (app de iPhone).
alter table users
  add column apple_sub text unique,
  -- Para revocar el acceso en Apple cuando la persona elimina su cuenta.
  add column apple_refresh_token text;
