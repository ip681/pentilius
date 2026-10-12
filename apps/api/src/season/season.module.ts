import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { PveModule } from '../pve/pve.module';
import { SeasonController } from './season.controller';
import { SeasonResetService } from './season-reset.service';
import { SeasonService } from './season.service';

@Module({
  imports: [PlayerModule, PveModule],
  controllers: [SeasonController],
  providers: [SeasonService, SeasonResetService],
  exports: [SeasonService, SeasonResetService],
})
export class SeasonModule {}
