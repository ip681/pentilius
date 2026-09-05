import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ExpeditionsService } from './expeditions.service';

@Controller('expeditions')
@UseGuards(JwtAuthGuard)
export class ExpeditionsController {
  constructor(private readonly expeditionsService: ExpeditionsService) {}

  @Get()
  getExpeditions(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.expeditionsService.getExpeditions(currentPlayer.sub);
  }

  @Post(':key/start')
  start(@CurrentPlayer() currentPlayer: JwtPayload, @Param('key') key: string) {
    return this.expeditionsService.start(currentPlayer.sub, key);
  }

  @Post('claim')
  claim(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.expeditionsService.claim(currentPlayer.sub);
  }

  @Post('cancel')
  cancel(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.expeditionsService.cancel(currentPlayer.sub);
  }
}
