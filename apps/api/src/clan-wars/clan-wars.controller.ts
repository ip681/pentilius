import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ClanWarsService } from './clan-wars.service';
import { ClanWarAttackDto } from './dto/clan-war-attack.dto';
import { DeclareWarDto } from './dto/declare-war.dto';

@Controller('clan-wars')
@UseGuards(JwtAuthGuard)
export class ClanWarsController {
  constructor(private readonly clanWarsService: ClanWarsService) {}

  @Post('declare')
  declareWar(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: DeclareWarDto) {
    return this.clanWarsService.declareWar(currentPlayer.sub, dto.targetClanId);
  }

  @Get('status')
  getStatus(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.clanWarsService.getStatus(currentPlayer.sub);
  }

  @Get('targets')
  getTargets(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.clanWarsService.getTargets(currentPlayer.sub);
  }

  @Post('attack')
  attack(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: ClanWarAttackDto) {
    return this.clanWarsService.attack(currentPlayer.sub, dto.defenderId);
  }

  @Get('reports')
  getReports(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.clanWarsService.getReports(currentPlayer.sub);
  }

  @Get('history')
  getHistory(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.clanWarsService.getHistory(currentPlayer.sub);
  }

  @Get(':warId/contributions')
  getContributions(@CurrentPlayer() currentPlayer: JwtPayload, @Param('warId') warId: string) {
    return this.clanWarsService.getContributions(currentPlayer.sub, warId);
  }
}
