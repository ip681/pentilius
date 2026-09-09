import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { CreateListingDto } from './dto/create-listing.dto';
import { MarketService } from './market.service';

@Controller('market')
@UseGuards(JwtAuthGuard)
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get()
  listActive(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.marketService.listActive(currentPlayer.sub);
  }

  @Get('mine')
  listMine(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.marketService.listMine(currentPlayer.sub);
  }

  @Post('listings')
  createListing(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: CreateListingDto) {
    return this.marketService.createListing(
      currentPlayer.sub,
      dto.itemInstanceId,
      { priceMetal: dto.priceMetal, priceCrystal: dto.priceCrystal, priceCredits: dto.priceCredits },
      { visibleToClanOnly: dto.visibleToClanOnly ?? false, visibleToFriendsOnly: dto.visibleToFriendsOnly ?? false },
    );
  }

  @Post('listings/:id/cancel')
  cancelListing(@CurrentPlayer() currentPlayer: JwtPayload, @Param('id') id: string) {
    return this.marketService.cancelListing(currentPlayer.sub, id);
  }

  @Post('listings/:id/buy')
  buyListing(@CurrentPlayer() currentPlayer: JwtPayload, @Param('id') id: string) {
    return this.marketService.buyListing(currentPlayer.sub, id);
  }
}
