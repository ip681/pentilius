import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { PveModule } from '../pve/pve.module';
import { BossFormationsController } from './boss-formations.controller';
import { BossFormationsService } from './boss-formations.service';

@Module({
  imports: [PlayerModule, PveModule],
  controllers: [BossFormationsController],
  providers: [BossFormationsService],
})
export class BossFormationsModule {}
