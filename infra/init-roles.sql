-- Roles y bases de desarrollo. En producción, usar contraseñas fuertes y gestionarlas como secretos.
-- adiestra_owner: dueño de las tablas (migraciones y cliente de sistema).
-- adiestra_app: rol de la aplicación, SIN BYPASSRLS: todas sus consultas pasan por Row Level Security.
CREATE ROLE adiestra_owner LOGIN PASSWORD 'owner_dev' CREATEDB;
CREATE ROLE adiestra_app LOGIN PASSWORD 'app_dev' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE adiestra OWNER adiestra_owner;
CREATE DATABASE adiestra_test OWNER adiestra_owner;
