import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BaseModule } from './base/base.module';
import configuration from './config/configuration';
import { InventoryModule } from './inventory/inventory.module';
import { PlayerModule } from './player/player.module';
import { PrismaModule } from './prisma/prisma.module';
import { PveModule } from './pve/pve.module';
import { ShipModule } from './ship/ship.module';
import { ZonesModule } from './zones/zones.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    AuthModule,
    PlayerModule,
    BaseModule,
    ShipModule,
    InventoryModule,
    ZonesModule,
    PveModule,
  ],
})
export class AppModule {}
