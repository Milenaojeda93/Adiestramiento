-- Aislamiento multiempresa con Row Level Security.
--
-- Dos roles de base de datos:
--   * adiestra_owner: dueño de las tablas. Lo usan las migraciones y el "cliente de sistema"
--     (login, alta de empresas, panel SaaS). Como dueño, no está sujeto a RLS.
--   * adiestra_app: rol con el que corre toda la operación de las empresas. Sin BYPASSRLS.
--     Cada transacción fija app.org_id y PostgreSQL filtra todas las filas por esa empresa.
--
-- Si app.org_id no está fijado, las políticas no devuelven ninguna fila.

CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'adiestra_app') THEN
    RAISE EXCEPTION 'Falta el rol adiestra_app. Crealo antes de migrar (ver README).';
  END IF;

  EXECUTE 'GRANT USAGE ON SCHEMA public TO adiestra_app';
  EXECUTE 'GRANT EXECUTE ON FUNCTION app_current_org() TO adiestra_app';

  -- Tablas por empresa: lectura y escritura, siempre filtradas por organization_id.
  FOREACH t IN ARRAY ARRAY['branches', 'roles', 'memberships', 'clients'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO adiestra_app', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO adiestra_app
         USING (organization_id = app_current_org())
         WITH CHECK (organization_id = app_current_org())', t);
  END LOOP;

  -- Auditoría: la app puede leer y agregar, nunca editar ni borrar.
  EXECUTE 'ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY';
  EXECUTE 'GRANT SELECT, INSERT ON audit_logs TO adiestra_app';
  EXECUTE 'DROP POLICY IF EXISTS tenant_read ON audit_logs';
  EXECUTE 'DROP POLICY IF EXISTS tenant_insert ON audit_logs';
  EXECUTE 'CREATE POLICY tenant_read ON audit_logs FOR SELECT TO adiestra_app USING (organization_id = app_current_org())';
  EXECUTE 'CREATE POLICY tenant_insert ON audit_logs FOR INSERT TO adiestra_app WITH CHECK (organization_id = app_current_org())';

  -- La empresa activa y su suscripción: solo lectura de la propia.
  EXECUTE 'ALTER TABLE organizations ENABLE ROW LEVEL SECURITY';
  EXECUTE 'GRANT SELECT, UPDATE ON organizations TO adiestra_app';
  EXECUTE 'DROP POLICY IF EXISTS own_org ON organizations';
  EXECUTE 'CREATE POLICY own_org ON organizations TO adiestra_app USING (id = app_current_org()) WITH CHECK (id = app_current_org())';

  EXECUTE 'ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY';
  EXECUTE 'GRANT SELECT ON subscriptions TO adiestra_app';
  EXECUTE 'DROP POLICY IF EXISTS own_subscription ON subscriptions';
  EXECUTE 'CREATE POLICY own_subscription ON subscriptions FOR SELECT TO adiestra_app USING (organization_id = app_current_org())';

  -- Catálogo de planes: lectura para todos (lo necesita el control de funciones).
  EXECUTE 'GRANT SELECT ON plans, features, plan_features TO adiestra_app';

  -- Usuarios: la app solo ve datos públicos de quienes son miembros de su empresa.
  -- Nunca el hash de contraseña ni datos de bloqueo.
  EXECUTE 'REVOKE ALL ON users FROM adiestra_app';
  EXECUTE 'GRANT SELECT (id, email, name, kind, active, last_login_at, created_at) ON users TO adiestra_app';
  EXECUTE 'ALTER TABLE users ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS members_of_org ON users';
  EXECUTE 'CREATE POLICY members_of_org ON users FOR SELECT TO adiestra_app USING (
             EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.organization_id = app_current_org()))';

  -- Sesiones: nunca accesibles desde la app.
  EXECUTE 'REVOKE ALL ON sessions FROM adiestra_app';
END $$;
