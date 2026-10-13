import { Controller, Get } from '@nestjs/common';

/**
 * Public "is the game up?" check (owner decision, 2026-10-13). The web client
 * (and later the mobile app) polls it after losing the connection — e.g. while
 * an update restarts the API — and resumes once it answers.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
