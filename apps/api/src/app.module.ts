import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from './core/auth.guard';
import { Public } from './core/context';
import { DbModule } from './core/db.module';
import { AllExceptionsFilter } from './core/errors';
import { FeaturesService } from './core/features.service';
import { SessionService } from './core/session.service';
import { TenantService } from './core/tenant.service';
import { AgendaController } from './modules/agenda.controller';
import { AuthController } from './modules/auth.controller';
import { ClientsController } from './modules/clients.controller';
import { FinanceController } from './modules/finance.controller';
import { OrganizationController } from './modules/organization.controller';
import { PetsController } from './modules/pets.controller';
import { SaasController } from './modules/saas.controller';
import { TeamController } from './modules/team.controller';
import { TrainingController } from './modules/training.controller';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true };
  }
}

@Module({
  imports: [
    DbModule,
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 60 }], skipIf: () => process.env.NODE_ENV === 'test' }),
  ],
  controllers: [
    HealthController,
    AuthController,
    ClientsController,
    PetsController,
    TrainingController,
    AgendaController,
    FinanceController,
    TeamController,
    OrganizationController,
    SaasController,
  ],
  providers: [
    SessionService,
    TenantService,
    FeaturesService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
