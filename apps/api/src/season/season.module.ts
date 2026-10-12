import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { PveModule } from '../pve/pve.module';
import { SeasonController } from './season.controller';
import { SeasonService } from './season.service';

@Module({
  imports: [PlayerModule, PveModule],
  controllers: [SeasonController],
  providers: [SeasonService],
  exports: [SeasonService],
})
export class SeasonModule {}
