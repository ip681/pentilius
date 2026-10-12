import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { CorePlayerRankingQueryDto } from './dto/core-player-ranking-query.dto';
import { SeasonService } from './season.service';

@Controller('core')
@UseGuards(JwtAuthGuard)
export class SeasonController {
  constructor(private readonly seasonService: SeasonService) {}

  @Get()
  getState(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.seasonService.getState(currentPlayer.sub);
  }

  @Post('attack')
  attack(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.seasonService.attack(currentPlayer.sub);
  }

  @Get('players')
  getPlayerRanking(@CurrentPlayer() currentPlayer: JwtPayload, @Query() query: CorePlayerRankingQueryDto) {
    return this.seasonService.getPlayerRanking(currentPlayer.sub, query.scope, query.page ?? 1);
  }

  @Get('results/clan/:clanId')
  getClanResults(@Param('clanId') clanId: string) {
    return this.seasonService.getClanSeasonResults(clanId);
  }
}
