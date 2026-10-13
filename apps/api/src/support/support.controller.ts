import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentAdmin } from '../admin/decorators/current-admin.decorator';
import { AdminJwtPayload } from '../admin/admin-jwt-payload.interface';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { CreateSupportTicketDto, SupportListQueryDto, SupportMessageDto } from './dto/support.dto';
import { SupportService } from './support.service';

/** Player side of "contact the team". */
@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets')
  listMine(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.support.listMine(currentPlayer.sub);
  }

  @Post('tickets')
  create(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: CreateSupportTicketDto) {
    return this.support.create(currentPlayer.sub, dto.category, dto.text);
  }

  @Post('tickets/:id/messages')
  reply(@CurrentPlayer() currentPlayer: JwtPayload, @Param('id') id: string, @Body() dto: SupportMessageDto) {
    return this.support.replyAsPlayer(currentPlayer.sub, id, dto.text);
  }

  @Post('tickets/:id/read')
  async markRead(@CurrentPlayer() currentPlayer: JwtPayload, @Param('id') id: string) {
    await this.support.markRead(currentPlayer.sub, id);
    return { ok: true };
  }
}

/** Godmaster side — one shared inbox for every moderator and admin. */
@Controller('admin/support')
@UseGuards(AdminJwtAuthGuard)
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(@Query() query: SupportListQueryDto) {
    return this.support.listForStaff(query.status, query.category);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.support.getForStaff(id);
  }

  @Post(':id/reply')
  reply(@Param('id') id: string, @Body() dto: SupportMessageDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.support.replyAsStaff(id, dto.text, admin);
  }

  @Post(':id/close')
  close(@Param('id') id: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.support.setStatusAsStaff(id, true, admin);
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.support.setStatusAsStaff(id, false, admin);
  }
}
