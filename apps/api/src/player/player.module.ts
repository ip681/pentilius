import { Module } from '@nestjs/common';
import { ClanBonusService } from './clan-bonus.service';
import { EconomyService } from './economy.service';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  controllers: [PlayerController],
  providers: [PlayerService, EconomyService, ClanBonusService],
  exports: [EconomyService, ClanBonusService],
})
export class PlayerModule {}
