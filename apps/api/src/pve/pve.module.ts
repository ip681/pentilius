import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { CombatService } from './combat.service';
import { PveController } from './pve.controller';
import { PveService } from './pve.service';

@Module({
  imports: [PlayerModule],
  controllers: [PveController],
  providers: [PveService, CombatService],
  exports: [CombatService],
})
export class PveModule {}
