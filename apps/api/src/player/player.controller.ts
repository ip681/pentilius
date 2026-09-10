import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ListPlayersDto } from './dto/list-players.dto';
import { UpdateAvatarDto } from './dto/update-avatar.dto';
import { UpdateBioDto } from './dto/update-bio.dto';
import { UpdateFrameDto } from './dto/update-frame.dto';
import { UpdateLocaleDto } from './dto/update-locale.dto';
import { PlayerService } from './player.service';

@Controller('player')
@UseGuards(JwtAuthGuard)
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Get()
  listPlayers(@CurrentPlayer() currentPlayer: JwtPayload, @Query() query: ListPlayersDto) {
    return this.playerService.listPlayers(currentPlayer.sub, query);
  }

  @Get('me')
  getMe(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.playerService.getProfile(currentPlayer.sub);
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
