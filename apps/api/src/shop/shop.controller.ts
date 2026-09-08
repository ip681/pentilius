import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ShopService } from './shop.service';

@Controller('shop')
@UseGuards(JwtAuthGuard)
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get()
  getShopItems() {
    return this.shopService.getShopItems();
  }

  @Post(':key/buy')
  buyItem(@CurrentPlayer() currentPlayer: JwtPayload, @Param('key') key: string) {
    return this.shopService.buyItem(currentPlayer.sub, key);
  }
}
