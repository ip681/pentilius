import { Body, Controller, Delete, Get, Param, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { AdminService } from './admin.service';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import { AdminLoginDto } from './dto/admin-login.dto';
import { ChangeAdminPasswordDto } from './dto/change-admin-password.dto';
import { BanPlayerDto } from './dto/ban-player.dto';
import { AddBannedWordDto, TestContentDto } from './dto/banned-word.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { GrantItemDto } from './dto/grant-item.dto';
import { GrantResourceDto } from './dto/grant-resource.dto';
import { RenamePlayerDto } from './dto/rename-player.dto';
import { SetPlayerPasswordDto } from './dto/set-player-password.dto';
import { SetVipDto } from './dto/set-vip.dto';
import { UnbanPlayerDto } from './dto/unban-player.dto';
import { ResetSeasonDto } from './dto/reset-season.dto';
import { ResolveReportsDto } from './dto/resolve-reports.dto';
import { UpdateGameSettingsDto } from './dto/update-game-settings.dto';
import { SetAdminActiveDto } from './dto/set-admin-active.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';
import { UpdateSeasonSettingsDto } from './dto/update-season-settings.dto';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { AdminJwtPayload } from './admin-jwt-payload.interface';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly adminService: AdminService,
  ) {}

  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('players/search')
  searchPlayers(@Query('q') q: string) {
    return this.adminService.searchPlayers(q);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('players/:username')
  getPlayerDetail(@Param('username') username: string) {
    return this.adminService.getPlayerDetail(username);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('items')
  listItems() {
    return this.adminService.listItems();
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('server-status')
  getServerStatus() {
    return this.adminService.getServerStatus();
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('grant/resource')
  grantResource(@Body() dto: GrantResourceDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.grantResource(dto, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('grant/item')
  grantItem(@Body() dto: GrantItemDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.grantItemToPlayer(dto, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('players/ban')
  banPlayer(@Body() dto: BanPlayerDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.banPlayer(dto, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('players/unban')
  unbanPlayer(@Body() dto: UnbanPlayerDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.unbanPlayer(dto, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('players/rename')
  renamePlayer(@Body() dto: RenamePlayerDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.renamePlayer(dto, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('players/password')
  setPlayerPassword(@Body() dto: SetPlayerPasswordDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.setPlayerPassword(dto, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('players/vip')
  setVip(@Body() dto: SetVipDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.setVip(dto, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('admins')
  listAdmins(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminAuthService.listAdmins(admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('admins')
  createAdmin(@Body() dto: CreateAdminDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminAuthService.createAdmin(dto, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('admins/:id/role')
  updateAdminRole(@Param('id') id: string, @Body() dto: UpdateAdminRoleDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminAuthService.updateRole(id, dto.role, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('admins/:id/reset-password')
  resetAdminPassword(@Param('id') id: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminAuthService.resetPassword(id, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('admins/:id/active')
  setAdminActive(@Param('id') id: string, @Body() dto: SetAdminActiveDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminAuthService.setActive(id, dto.active, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('me/password')
  changeOwnPassword(@Body() dto: ChangeAdminPasswordDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminAuthService.changeOwnPassword(admin, dto.currentPassword, dto.newPassword);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('refresh')
  refresh(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminAuthService.refresh(admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('backups')
  listBackups() {
    return this.adminService.listBackups();
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('backups/:filename/download')
  async downloadBackup(@Param('filename') filename: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const filePath = await this.adminService.getBackupFilePath(filename);
    res.set({ 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Type': 'application/octet-stream' });
    return new StreamableFile(createReadStream(filePath));
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('season')
  getSeasonSettings() {
    return this.adminService.getSeasonSettings();
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('season')
  updateSeasonSettings(@Body() dto: UpdateSeasonSettingsDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.updateSeasonSettings(dto, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('content-filter/words')
  listBannedWords() {
    return this.adminService.listBannedWords();
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('content-filter/words')
  addBannedWord(@Body() dto: AddBannedWordDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.addBannedWord(dto, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Delete('content-filter/words/:id')
  removeBannedWord(@Param('id') id: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.removeBannedWord(id, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('content-filter/test')
  testContent(@Body() dto: TestContentDto) {
    return this.adminService.testContent(dto.text);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('season/reset')
  resetSeasonNow(@Body() dto: ResetSeasonDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.resetSeasonNow(dto, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('game-settings')
  getGameSettings() {
    return this.adminService.getGameSettings();
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('game-settings')
  updateGameSettings(@Body() dto: UpdateGameSettingsDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.updateGameSettings(dto, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('reports')
  getReports(@Query('view') view: string) {
    return this.adminService.getReports(view === 'closed' ? 'closed' : 'open');
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('reports/resolve')
  resolveReports(@Body() dto: ResolveReportsDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.resolveReports(dto, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Delete('clan-messages/:id')
  deleteClanMessage(@Param('id') id: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminService.deleteClanMessage(id, admin);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('action-log')
  getRecentActions() {
    return this.adminService.getRecentActions();
  }
}
