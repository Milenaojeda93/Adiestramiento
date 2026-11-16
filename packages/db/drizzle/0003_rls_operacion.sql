-- RLS para las tablas de operación (mascotas, evaluaciones, programas, agenda, finanzas).
-- Mismo patrón que 0001: el rol de la app solo ve y escribe filas de la empresa fijada en app.org_id.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pets', 'pet_guardians', 'skills', 'assessments', 'skill_ratings', 'services', 'programs',
    'working_hours', 'time_off', 'training_sessions', 'home_tasks', 'charges', 'expenses', 'counters'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO adiestra_app', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO adiestra_app
         USING (organization_id = app_current_org())
         WITH CHECK (organization_id = app_current_org())', t);
  END LOOP;

  -- Movimientos de paquetes, pagos e imputaciones: se agregan, nunca se editan ni se borran.
  -- (Un pago se anula con la marca "voided" y su contrapartida, no borrándolo.)
  FOREACH t IN ARRAY ARRAY['package_ledger', 'payment_allocations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT ON %I TO adiestra_app', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_read ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %I', t);
    EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT TO adiestra_app USING (organization_id = app_current_org())', t);
    EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT TO adiestra_app WITH CHECK (organization_id = app_current_org())', t);
  END LOOP;

  EXECUTE 'ALTER TABLE payments ENABLE ROW LEVEL SECURITY';
  EXECUTE 'GRANT SELECT, INSERT ON payments TO adiestra_app';
  EXECUTE 'GRANT UPDATE (voided, notes) ON payments TO adiestra_app';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON payments';
  EXECUTE 'CREATE POLICY tenant_isolation ON payments TO adiestra_app USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org())';

  -- Las políticas nuevas de la empresa (ausencias, horas para cancelar) se editan desde Configuración.
  EXECUTE 'GRANT UPDATE ON organizations TO adiestra_app';
END $$;
--> statement-breakpoint

-- Choques de horario: un entrenador no puede tener dos sesiones activas superpuestas.
-- La API ya lo valida con un mensaje claro; esta restricción lo garantiza aunque dos personas guarden a la vez.
-- Requiere la extensión btree_gist (en Supabase y en el docker de desarrollo la crea el superusuario).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
    ALTER TABLE training_sessions
      ADD CONSTRAINT training_sessions_no_overlap
      EXCLUDE USING gist (trainer_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
      WHERE (status IN ('SCHEDULED', 'CONFIRMED', 'DONE'));
  ELSE
    RAISE NOTICE 'btree_gist no está instalada: los choques de horario los valida solo la API';
  END IF;
END $$;
