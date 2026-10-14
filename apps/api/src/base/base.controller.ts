import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { BaseService } from './base.service';

class ExchangeDto {
  @IsIn(['METAL', 'CRYSTAL'])
  from!: 'METAL' | 'CRYSTAL';

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amount!: number;
}

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

  @Post('buildings/:key/queue')
  queueBuilding(@CurrentPlayer() currentPlayer: JwtPayload, @Param('key') key: string) {
    return this.baseService.queueBuilding(currentPlayer.sub, key);
  }

  @Post('exchange')
  exchange(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: ExchangeDto) {
    return this.baseService.exchange(currentPlayer.sub, dto.from, dto.amount);
  }

  @Delete('queue')
  cancelQueue(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.baseService.cancelQueue(currentPlayer.sub);
  }
}
