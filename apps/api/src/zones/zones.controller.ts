import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ZonesService } from './zones.service';

@Controller('zones')
@UseGuards(JwtAuthGuard)
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Get()
  getZones(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.zonesService.getZones(currentPlayer.sub);
  }

  @Get(':zoneId/pentili')
  getPentili(@CurrentPlayer() currentPlayer: JwtPayload, @Param('zoneId') zoneId: string) {
    return this.zonesService.getPentiliInZone(currentPlayer.sub, zoneId);
  }
}
