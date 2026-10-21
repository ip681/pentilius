import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminJwtPayload } from '../admin/admin-jwt-payload.interface';
import { CurrentAdmin } from '../admin/decorators/current-admin.decorator';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { AnnouncementsService } from './announcements.service';
import { SaveAnnouncementBodyDto } from './dto/save-announcement.dto';

/** A player closes an announcement; the list itself comes with GET /player/me/notifications. */
@Controller('player/me/announcements')
@UseGuards(JwtAuthGuard)
export class PlayerAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Post(':id/dismiss')
  @HttpCode(204)
  dismiss(@CurrentPlayer() currentPlayer: JwtPayload, @Param('id') id: string) {
    return this.announcements.dismiss(currentPlayer.sub, id);
  }
}

/** godmaster → Announcements (owner decision, 2026-10-21). ADMIN only — checked in the service. */
@Controller('admin/announcements')
@UseGuards(AdminJwtAuthGuard)
export class AdminAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.announcements.list(admin);
  }

  @Post()
  create(@Body() dto: SaveAnnouncementBodyDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.announcements.create(dto, admin);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: SaveAnnouncementBodyDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.announcements.update(id, dto, admin);
  }

  @Post(':id/end')
  end(@Param('id') id: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.announcements.end(id, admin);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.announcements.remove(id, admin);
  }
}
