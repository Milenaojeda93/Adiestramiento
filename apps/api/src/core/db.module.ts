import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { createDb, Db } from '@adiestra/db';
import type { Pool } from '@adiestra/db';
import { AppConfig, CONFIG, loadConfig } from './config';

/** Cliente con el rol dueño (sin RLS). Solo para auth, alta de empresas y panel SaaS. */
export const SYSTEM_DB = Symbol('SYSTEM_DB');
/** Cliente con el rol de la app (con RLS). Usar siempre a través de TenantService. */
export const APP_DB = Symbol('APP_DB');
const POOLS = Symbol('POOLS');

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    {
      provide: POOLS,
      inject: [CONFIG],
      useFactory: (cfg: AppConfig) => ({
        system: createDb(cfg.DATABASE_URL_OWNER, 5),
        app: createDb(cfg.DATABASE_URL_APP, 15),
      }),
    },
    { provide: SYSTEM_DB, inject: [POOLS], useFactory: (p: { system: { db: Db } }) => p.system.db },
    { provide: APP_DB, inject: [POOLS], useFactory: (p: { app: { db: Db } }) => p.app.db },
  ],
  exports: [CONFIG, SYSTEM_DB, APP_DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(POOLS) private readonly pools: { system: { pool: Pool }; app: { pool: Pool } }) {}
  async onApplicationShutdown() {
    await Promise.all([this.pools.system.pool.end(), this.pools.app.pool.end()]);
  }
}
