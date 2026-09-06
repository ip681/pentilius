import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { ClansController } from './clans.controller';
import { ClansService } from './clans.service';

@Module({
  imports: [PlayerModule],
  controllers: [ClansController],
  providers: [ClansService],
})
export class ClansModule {}
