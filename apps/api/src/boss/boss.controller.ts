import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { BossService } from './boss.service';

@Controller('bosses')
@UseGuards(JwtAuthGuard)
export class BossController {
  constructor(private readonly bossService: BossService) {}

  @Get()
  getBosses(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.bossService.getBosses(currentPlayer.sub);
  }

  @Post(':key/join')
  join(@CurrentPlayer() currentPlayer: JwtPayload, @Param('key') key: string) {
    return this.bossService.joinEncounter(currentPlayer.sub, key);
  }

  @Post(':key/resolve')
  resolve(@CurrentPlayer() currentPlayer: JwtPayload, @Param('key') key: string) {
    return this.bossService.resolveEncounter(currentPlayer.sub, key);
  }
}
