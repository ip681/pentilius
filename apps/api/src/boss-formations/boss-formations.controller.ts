import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { BossFormationsService } from './boss-formations.service';
import { CreateFormationDto } from './dto/create-formation.dto';
import { UpdateFormationVisibilityDto } from './dto/update-formation-visibility.dto';

@Controller('boss-formations')
@UseGuards(JwtAuthGuard)
export class BossFormationsController {
  constructor(private readonly bossFormationsService: BossFormationsService) {}

  @Get()
  getFormations(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.bossFormationsService.getFormations(currentPlayer.sub);
  }

  @Get(':id')
  getFormation(@CurrentPlayer() currentPlayer: JwtPayload, @Param('id') id: string) {
    return this.bossFormationsService.getFormation(currentPlayer.sub, id);
  }

  @Post()
  create(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: CreateFormationDto) {
    return this.bossFormationsService.createFormation(currentPlayer.sub, dto.bossKey, {
      visibleToClanOnly: dto.visibleToClanOnly ?? false,
      visibleToFriendsOnly: dto.visibleToFriendsOnly ?? false,
    });
  }

  @Post(':id/join')
  join(@CurrentPlayer() currentPlayer: JwtPayload, @Param('id') id: string) {
    return this.bossFormationsService.joinFormation(currentPlayer.sub, id);
  }

  @Patch(':id/visibility')
  updateVisibility(@CurrentPlayer() currentPlayer: JwtPayload, @Param('id') id: string, @Body() dto: UpdateFormationVisibilityDto) {
    return this.bossFormationsService.updateVisibility(currentPlayer.sub, id, dto);
  }
}
