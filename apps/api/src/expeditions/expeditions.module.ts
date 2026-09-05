import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { ExpeditionsController } from './expeditions.controller';
import { ExpeditionsService } from './expeditions.service';

@Module({
  imports: [PlayerModule],
  controllers: [ExpeditionsController],
  providers: [ExpeditionsService],
})
export class ExpeditionsModule {}
