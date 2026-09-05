import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ShipService } from './ship.service';

@Controller('ship')
@UseGuards(JwtAuthGuard)
export class ShipController {
  constructor(private readonly shipService: ShipService) {}

  @Get()
  getShip(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.shipService.getShip(currentPlayer.sub);
  }

  @Post('equip/:itemInstanceId')
  equip(@CurrentPlayer() currentPlayer: JwtPayload, @Param('itemInstanceId') itemInstanceId: string) {
    return this.shipService.equip(currentPlayer.sub, itemInstanceId);
  }

  @Post('unequip/:slot')
  unequip(@CurrentPlayer() currentPlayer: JwtPayload, @Param('slot') slot: string) {
    return this.shipService.unequip(currentPlayer.sub, slot);
  }
}
