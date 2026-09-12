import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminService } from './admin.service';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import { AdminLoginDto } from './dto/admin-login.dto';
import { BanPlayerDto } from './dto/ban-player.dto';
import { GrantItemDto } from './dto/grant-item.dto';
import { GrantResourceDto } from './dto/grant-resource.dto';
import { RenamePlayerDto } from './dto/rename-player.dto';
import { UnbanPlayerDto } from './dto/unban-player.dto';
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
}
