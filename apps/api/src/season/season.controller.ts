import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { CorePlayerRankingQueryDto } from './dto/core-player-ranking-query.dto';
import { SeasonResetService } from './season-reset.service';
import { SeasonService } from './season.service';

@Controller('core')
@UseGuards(JwtAuthGuard)
export class SeasonController {
  constructor(
    private readonly seasonService: SeasonService,
    private readonly seasonReset: SeasonResetService,
  ) {}

  @Get()
  getState(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.seasonService.getState(currentPlayer.sub);
  }

  /**
   * Called by the client the moment its season-reset countdown runs out (and
   * on load if that moment has already passed): resets right away if it's due
   * by the SERVER's clock, so players don't wait for the minute timer. A
   * client can't trigger it early.
   */
  @Post('season-check')
  async seasonCheck() {
    await this.seasonReset.resetIfDue();
    return { ok: true };
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
