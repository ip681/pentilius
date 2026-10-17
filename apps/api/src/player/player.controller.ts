import { Body, Controller, Get, Ip, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChooseRaceDto } from './dto/choose-race.dto';
import { ListPlayersDto } from './dto/list-players.dto';
import { UpdateAvatarDto } from './dto/update-avatar.dto';
import { UpdateBioDto } from './dto/update-bio.dto';
import { UpdateFrameDto } from './dto/update-frame.dto';
import { UpdateLocaleDto } from './dto/update-locale.dto';
import { ConfigService } from '@nestjs/config';
import { paymentsOfferedTo } from '../payments/payment-country';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerService } from './player.service';

@Controller('player')
@UseGuards(JwtAuthGuard)
export class PlayerController {
  constructor(
    private readonly playerService: PlayerService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  listPlayers(@CurrentPlayer() currentPlayer: JwtPayload, @Query() query: ListPlayersDto) {
    return this.playerService.listPlayers(currentPlayer.sub, query);
  }

  @Get('me')
  async getMe(@CurrentPlayer() currentPlayer: JwtPayload, @Ip() ip: string) {
    const profile = await this.playerService.getProfile(currentPlayer.sub);
    // Real-money purchases are offered only in some countries (owner decision, 2026-10-15).
    return { ...profile, paymentsAvailable: await paymentsOfferedTo(ip, this.prisma, this.config) };
  }

  @Get('me/notifications')
  getNotifications(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.playerService.getNotifications(currentPlayer.sub);
  }

  @Post('me/bio')
  updateBio(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: UpdateBioDto) {
    return this.playerService.updateBio(currentPlayer.sub, dto.bio);
  }

  @Post('me/password')
  changePassword(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.playerService.changePassword(currentPlayer.sub, dto.currentPassword, dto.newPassword);
  }

  @Post('me/locale')
  updateLocale(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: UpdateLocaleDto) {
    return this.playerService.updatePreferredLocale(currentPlayer.sub, dto.locale);
  }

  @Post('me/race')
  chooseRace(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: ChooseRaceDto) {
    return this.playerService.chooseRace(currentPlayer.sub, dto.race);
  }

  @Get('cosmetics')
  getCosmeticsCatalog() {
    return this.playerService.getCosmeticsCatalog();
  }

  @Post('me/avatar')
  updateAvatar(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: UpdateAvatarDto) {
    return this.playerService.updateAvatar(currentPlayer.sub, dto.avatarKey);
  }

  @Post('me/frame')
  updateFrame(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: UpdateFrameDto) {
    return this.playerService.updateFrame(currentPlayer.sub, dto.frameKey);
  }

  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.playerService.getPublicProfile(id);
  }
}
