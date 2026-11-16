-- Roles y bases de desarrollo. En producción, usar contraseñas fuertes y gestionarlas como secretos.
-- adiestra_owner: dueño de las tablas (migraciones y cliente de sistema).
-- adiestra_app: rol de la aplicación, SIN BYPASSRLS: todas sus consultas pasan por Row Level Security.
CREATE ROLE adiestra_owner LOGIN PASSWORD 'owner_dev' CREATEDB;
CREATE ROLE adiestra_app LOGIN PASSWORD 'app_dev' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE adiestra OWNER adiestra_owner;
CREATE DATABASE adiestra_test OWNER adiestra_owner;

-- Extensión para impedir en la base sesiones superpuestas del mismo entrenador.
\c adiestra
CREATE SCHEMA IF NOT EXISTS extensions; GRANT USAGE ON SCHEMA extensions TO PUBLIC;
CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA extensions;
\c adiestra_test
CREATE SCHEMA IF NOT EXISTS extensions; GRANT USAGE ON SCHEMA extensions TO PUBLIC;
CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA extensions;
