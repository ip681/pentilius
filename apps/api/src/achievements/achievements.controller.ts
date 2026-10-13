import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { AchievementsService } from './achievements.service';

@Controller('achievements')
@UseGuards(JwtAuthGuard)
export class AchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  @Get()
  get(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.achievements.getAchievements(currentPlayer.sub);
  }

  /** claimKey = an achievement tier ("pentili_wins_2") or a level reward ("level_12"). */
  @Post(':claimKey/claim')
  claim(@CurrentPlayer() currentPlayer: JwtPayload, @Param('claimKey') claimKey: string) {
    return this.achievements.claim(currentPlayer.sub, claimKey);
  }
}
