import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { PveModule } from '../pve/pve.module';
import { ClanWarsController } from './clan-wars.controller';
import { ClanWarsService } from './clan-wars.service';

@Module({
  imports: [PlayerModule, PveModule],
  controllers: [ClanWarsController],
  providers: [ClanWarsService],
})
export class ClanWarsModule {}
