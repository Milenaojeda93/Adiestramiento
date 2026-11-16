// Punto de entrada para Vercel: la API completa corre como una única función.
// Se reutiliza la instancia de Nest entre invocaciones de la misma función.
require('reflect-metadata');
const { createApp } = require('../dist/bootstrap');

let handlerPromise;

function getHandler() {
  if (!handlerPromise) {
    handlerPromise = createApp().then(async (app) => {
      await app.init();
      return app.getHttpAdapter().getInstance();
    });
  }
  return handlerPromise;
}

module.exports = async (req, res) => {
  const handler = await getHandler();
  return handler(req, res);
};
