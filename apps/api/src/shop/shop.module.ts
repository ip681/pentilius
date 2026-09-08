import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [PlayerModule],
  controllers: [ShopController],
  providers: [ShopService],
})
export class ShopModule {}
