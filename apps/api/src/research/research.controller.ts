import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ResearchService } from './research.service';

@Controller('research')
@UseGuards(JwtAuthGuard)
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Get()
  getResearches(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.researchService.getResearches(currentPlayer.sub);
  }

  @Post(':key/start')
  startResearch(@CurrentPlayer() currentPlayer: JwtPayload, @Param('key') key: string) {
    return this.researchService.startResearch(currentPlayer.sub, key);
  }
}
