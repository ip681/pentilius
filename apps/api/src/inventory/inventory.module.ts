import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [PlayerModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
