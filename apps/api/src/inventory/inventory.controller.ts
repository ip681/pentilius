import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { UseItemDto } from './dto/use-item.dto';
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

  @Post('items/:id/use')
  useItem(@CurrentPlayer() currentPlayer: JwtPayload, @Param('id') id: string, @Body() body: UseItemDto) {
    return this.inventoryService.useConsumable(currentPlayer.sub, id, body.buildingKey);
  }
}
