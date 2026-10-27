import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { AdminJwtPayload } from '../admin/admin-jwt-payload.interface';
import { CurrentAdmin } from '../admin/decorators/current-admin.decorator';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminBalanceService } from './admin-balance.service';
import { SavePentiliBalanceDto } from './dto/save-pentili-balance.dto';
import { SaveBuildingBalanceDto } from './dto/save-building-balance.dto';
import { SaveClanBalanceDto } from './dto/save-clan-balance.dto';
import { SaveEquipmentBalanceDto } from './dto/save-equipment-balance.dto';
import { SaveExpeditionBalanceDto } from './dto/save-expedition-balance.dto';
import { BossRealTestDto } from './dto/boss-real-test.dto';
import { SaveBossBalanceDto } from './dto/save-boss-balance.dto';
import { SaveOtherBalanceDto } from './dto/save-other-balance.dto';
import { SaveRewardBalanceDto } from './dto/save-reward-balance.dto';
import { SaveShopDto } from './dto/save-shop.dto';
import { SaveXpBalanceDto } from './dto/save-xp-balance.dto';

/** godmaster's Balance tab (owner decision, 2026-10-18). ADMIN only — checked in the service. */
@Controller('admin/balance')
@UseGuards(AdminJwtAuthGuard)
export class AdminBalanceController {
  constructor(private readonly balance: AdminBalanceService) {}

  @Get('pentili')
  getPentili(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.getPentili(admin);
  }

  @Post('pentili/preview')
  previewPentili(@Body() dto: SavePentiliBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.previewPentili(dto, admin);
  }

  @Put('pentili')
  savePentili(@Body() dto: SavePentiliBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.savePentili(dto, admin);
  }

  @Get('buildings')
  getBuildings(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.getBuildings(admin);
  }

  @Post('buildings/preview')
  previewBuildings(@Body() dto: SaveBuildingBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.previewBuildings(dto, admin);
  }

  @Put('buildings')
  saveBuildings(@Body() dto: SaveBuildingBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.saveBuildings(dto, admin);
  }

  @Get('rewards')
  getRewards(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.getRewards(admin);
  }

  @Post('rewards/preview')
  previewRewards(@Body() dto: SaveRewardBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.previewRewards(dto, admin);
  }

  @Put('rewards')
  saveRewards(@Body() dto: SaveRewardBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.saveRewards(dto, admin);
  }

  @Get('technical')
  getTechnical(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.getTechnical(admin);
  }

  @Put('technical')
  saveTechnical(@Body() dto: SaveOtherBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.saveTechnical(dto, admin);
  }

  @Get('other')
  getOther(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.getOther(admin);
  }

  @Put('other')
  saveOther(@Body() dto: SaveOtherBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.saveOther(dto, admin);
  }

  @Get('bosses')
  getBosses(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.getBosses(admin);
  }

  @Post('bosses/preview')
  previewBosses(@Body() dto: SaveBossBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.previewBosses(dto, admin);
  }

  @Post('bosses/real-test')
  testBossWithPlayers(@Body() dto: BossRealTestDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.testBossWithPlayers(dto, admin);
  }

  @Put('bosses')
  saveBosses(@Body() dto: SaveBossBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.saveBosses(dto, admin);
  }

  @Get('expeditions')
  getExpeditions(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.getExpeditions(admin);
  }

  @Post('expeditions/preview')
  previewExpeditions(@Body() dto: SaveExpeditionBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.previewExpeditions(dto, admin);
  }

  @Put('expeditions')
  saveExpeditions(@Body() dto: SaveExpeditionBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.saveExpeditions(dto, admin);
  }

  @Get('equipment')
  getEquipment(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.getEquipment(admin);
  }

  @Post('equipment/preview')
  previewEquipment(@Body() dto: SaveEquipmentBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.previewEquipment(dto, admin);
  }

  @Put('equipment')
  saveEquipment(@Body() dto: SaveEquipmentBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.saveEquipment(dto, admin);
  }

  @Get('clan')
  getClan(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.getClan(admin);
  }

  @Post('clan/preview')
  previewClan(@Body() dto: SaveClanBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.previewClan(dto, admin);
  }

  @Put('clan')
  saveClan(@Body() dto: SaveClanBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.saveClan(dto, admin);
  }

  @Get('shop')
  getShop(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.getShop(admin);
  }

  @Put('shop')
  saveShop(@Body() dto: SaveShopDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.saveShop(dto, admin);
  }

  @Get('xp')
  getXp(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.getXp(admin);
  }

  @Post('xp/preview')
  previewXp(@Body() dto: SaveXpBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.previewXp(dto, admin);
  }

  @Put('xp')
  saveXp(@Body() dto: SaveXpBalanceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.balance.saveXp(dto, admin);
  }
}
