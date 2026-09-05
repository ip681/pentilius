import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { BaseService } from './base.service';

@Controller('base')
@UseGuards(JwtAuthGuard)
export class BaseController {
  constructor(private readonly baseService: BaseService) {}

  @Get()
  getBase(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.baseService.getBase(currentPlayer.sub);
  }

  @Post('buildings/:key/upgrade')
  upgradeBuilding(@CurrentPlayer() currentPlayer: JwtPayload, @Param('key') key: string) {
    return this.baseService.upgradeBuilding(currentPlayer.sub, key);
  }
}
