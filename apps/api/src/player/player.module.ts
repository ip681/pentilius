import { Module } from '@nestjs/common';
import { EconomyService } from './economy.service';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  controllers: [PlayerController],
  providers: [PlayerService, EconomyService],
  exports: [EconomyService],
})
export class PlayerModule {}
