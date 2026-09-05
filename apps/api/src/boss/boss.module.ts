import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { PveModule } from '../pve/pve.module';
import { BossController } from './boss.controller';
import { BossService } from './boss.service';

@Module({
  imports: [PlayerModule, PveModule],
  controllers: [BossController],
  providers: [BossService],
})
export class BossModule {}
