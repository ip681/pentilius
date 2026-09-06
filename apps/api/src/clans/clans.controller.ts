import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ClansService } from './clans.service';
import { CreateClanDto } from './dto/create-clan.dto';
import { DonateDto } from './dto/donate.dto';
import { UpdateClanDto } from './dto/update-clan.dto';

@Controller('clans')
@UseGuards(JwtAuthGuard)
export class ClansController {
  constructor(private readonly clansService: ClansService) {}

  @Get()
  listClans() {
    return this.clansService.listClans();
  }

  @Get('me')
  getMyClan(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.clansService.getMyClan(currentPlayer.sub);
  }

  @Get(':id')
  getClan(@CurrentPlayer() currentPlayer: JwtPayload, @Param('id') id: string) {
    return this.clansService.getClan(id, currentPlayer.sub);
  }

  @Post()
  createClan(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: CreateClanDto) {
    return this.clansService.createClan(currentPlayer.sub, dto);
  }

  @Post(':id/join')
  joinClan(@CurrentPlayer() currentPlayer: JwtPayload, @Param('id') id: string) {
    return this.clansService.joinClan(currentPlayer.sub, id);
  }

  @Post('leave')
  leaveClan(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.clansService.leaveClan(currentPlayer.sub);
  }

  @Post('disband')
  disbandClan(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.clansService.disbandClan(currentPlayer.sub);
  }

  @Post('update')
  updateClan(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: UpdateClanDto) {
    return this.clansService.updateClan(currentPlayer.sub, dto);
  }

  @Post('donate')
  donate(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: DonateDto) {
    return this.clansService.donate(currentPlayer.sub, dto);
  }

  @Post('buildings/:key/upgrade')
  upgradeBuilding(@CurrentPlayer() currentPlayer: JwtPayload, @Param('key') key: string) {
    return this.clansService.upgradeClanBuilding(currentPlayer.sub, key);
  }

  @Post('members/:playerId/kick')
  kickMember(@CurrentPlayer() currentPlayer: JwtPayload, @Param('playerId') playerId: string) {
    return this.clansService.kickMember(currentPlayer.sub, playerId);
  }

  @Post('members/:playerId/promote')
  promote(@CurrentPlayer() currentPlayer: JwtPayload, @Param('playerId') playerId: string) {
    return this.clansService.setOfficerRole(currentPlayer.sub, playerId, true);
  }

  @Post('members/:playerId/demote')
  demote(@CurrentPlayer() currentPlayer: JwtPayload, @Param('playerId') playerId: string) {
    return this.clansService.setOfficerRole(currentPlayer.sub, playerId, false);
  }

  @Post('members/:playerId/transfer-leadership')
  transferLeadership(@CurrentPlayer() currentPlayer: JwtPayload, @Param('playerId') playerId: string) {
    return this.clansService.transferLeadership(currentPlayer.sub, playerId);
  }
}
