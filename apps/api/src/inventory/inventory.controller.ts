import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  getInventory(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.inventoryService.getInventory(currentPlayer.sub);
  }

  @Post('items/:id/upgrade')
  upgradeItem(@CurrentPlayer() currentPlayer: JwtPayload, @Param('id') id: string) {
    return this.inventoryService.upgradeItem(currentPlayer.sub, id);
  }
}
