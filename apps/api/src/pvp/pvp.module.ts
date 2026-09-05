import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { PveModule } from '../pve/pve.module';
import { PvpController } from './pvp.controller';
import { PvpService } from './pvp.service';

@Module({
  imports: [PlayerModule, PveModule],
  controllers: [PvpController],
  providers: [PvpService],
})
export class PvpModule {}
