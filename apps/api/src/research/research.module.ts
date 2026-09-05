import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';

@Module({
  imports: [PlayerModule],
  controllers: [ResearchController],
  providers: [ResearchService],
})
export class ResearchModule {}
