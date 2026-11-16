import 'reflect-metadata';
import { loadConfig } from './core/config';
import { createApp } from './bootstrap';

async function main() {
  const cfg = loadConfig();
  const app = await createApp();
  await app.listen(cfg.PORT);
  console.log(`API escuchando en http://localhost:${cfg.PORT}/api/v1`);
}

main();
