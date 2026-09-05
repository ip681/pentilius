import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { PveService } from './pve.service';

@Controller('pve')
@UseGuards(JwtAuthGuard)
export class PveController {
  constructor(private readonly pveService: PveService) {}

  @Post('attack/:pentiliId')
  attack(@CurrentPlayer() currentPlayer: JwtPayload, @Param('pentiliId') pentiliId: string) {
    return this.pveService.attack(currentPlayer.sub, pentiliId);
  }

  @Get('reports')
  getReports(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.pveService.getReports(currentPlayer.sub);
  }
}
