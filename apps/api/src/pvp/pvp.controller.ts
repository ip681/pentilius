import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { AttackOpponentDto } from './dto/attack-opponent.dto';
import { PvpService } from './pvp.service';

@Controller('pvp')
@UseGuards(JwtAuthGuard)
export class PvpController {
  constructor(private readonly pvpService: PvpService) {}

  @Get('status')
  getStatus(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.pvpService.getStatus(currentPlayer.sub);
  }

  @Get('scout')
  scout(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.pvpService.scoutOpponent(currentPlayer.sub);
  }

  @Post('attack')
  attack(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: AttackOpponentDto) {
    return this.pvpService.attackOpponent(currentPlayer.sub, dto.opponentId);
  }

  @Get('reports')
  getReports(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.pvpService.getReports(currentPlayer.sub);
  }
}
