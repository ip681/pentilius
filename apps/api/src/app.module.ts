import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BaseModule } from './base/base.module';
import { BossFormationsModule } from './boss-formations/boss-formations.module';
import { ClanWarsModule } from './clan-wars/clan-wars.module';
import { ClansModule } from './clans/clans.module';
import configuration from './config/configuration';
import { ExpeditionsModule } from './expeditions/expeditions.module';
import { FriendsModule } from './friends/friends.module';
import { InventoryModule } from './inventory/inventory.module';
import { MarketModule } from './market/market.module';
import { PlayerModule } from './player/player.module';
import { PrismaModule } from './prisma/prisma.module';
import { PveModule } from './pve/pve.module';
import { PvpModule } from './pvp/pvp.module';
import { ReportsModule } from './reports/reports.module';
import { ResearchModule } from './research/research.module';
import { RobotModule } from './robot/robot.module';
import { ShopModule } from './shop/shop.module';
import { ZonesModule } from './zones/zones.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    AuthModule,
    PlayerModule,
    BaseModule,
    RobotModule,
    InventoryModule,
    ZonesModule,
    PveModule,
    ExpeditionsModule,
    ResearchModule,
    BossFormationsModule,
    PvpModule,
    ClansModule,
    ClanWarsModule,
    ReportsModule,
    ShopModule,
    FriendsModule,
    MarketModule,
    AdminModule,
  ],
})
export class AppModule {}
