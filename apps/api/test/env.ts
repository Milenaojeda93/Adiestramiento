// Variables de entorno de las pruebas: base separada adiestra_test.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL_OWNER ??= 'postgresql://adiestra_owner:owner_dev@localhost:5432/adiestra_test';
process.env.DATABASE_URL_APP ??= 'postgresql://adiestra_app:app_dev@localhost:5432/adiestra_test';
process.env.WEB_ORIGIN = 'http://localhost:3000';
