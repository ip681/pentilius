import { Module } from '@nestjs/common';
import { PveModule } from '../pve/pve.module';
import { AdminBalanceController } from './admin-balance.controller';
import { AdminBalanceService } from './admin-balance.service';

/** Balance edited from godmaster (owner decision, 2026-10-18) — Pentili first. */
@Module({
  imports: [PveModule],
  controllers: [AdminBalanceController],
  providers: [AdminBalanceService],
})
export class BalanceModule {}
