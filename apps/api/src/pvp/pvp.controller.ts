import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { PvpService } from './pvp.service';

@Controller('pvp')
@UseGuards(JwtAuthGuard)
export class PvpController {
  constructor(private readonly pvpService: PvpService) {}

  @Get('status')
  getStatus(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.pvpService.getStatus(currentPlayer.sub);
  }

  @Post('attack')
  attack(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.pvpService.attackRandomOpponent(currentPlayer.sub);
  }

  @Get('reports')
  getReports(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.pvpService.getReports(currentPlayer.sub);
  }
}
