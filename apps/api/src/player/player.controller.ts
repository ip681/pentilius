import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ListPlayersDto } from './dto/list-players.dto';
import { UpdateBioDto } from './dto/update-bio.dto';
import { PlayerService } from './player.service';

@Controller('player')
@UseGuards(JwtAuthGuard)
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Get()
  listPlayers(@Query() query: ListPlayersDto) {
    return this.playerService.listPlayers(query);
  }

  @Get('me')
  getMe(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.playerService.getProfile(currentPlayer.sub);
  }

  @Post('me/bio')
  updateBio(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: UpdateBioDto) {
    return this.playerService.updateBio(currentPlayer.sub, dto.bio);
  }

  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.playerService.getPublicProfile(id);
  }
}
