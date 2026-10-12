import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { CreateReportDto } from './dto/create-report.dto';
import { ModerationService } from './moderation.service';

@Controller('moderation')
@UseGuards(JwtAuthGuard)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('blocks')
  listBlocked(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.moderationService.listBlocked(currentPlayer.sub);
  }

  @Get('blocks/:playerId')
  getBlockStatus(@CurrentPlayer() currentPlayer: JwtPayload, @Param('playerId') playerId: string) {
    return this.moderationService.getBlockStatus(currentPlayer.sub, playerId);
  }

  @Post('blocks/:playerId')
  block(@CurrentPlayer() currentPlayer: JwtPayload, @Param('playerId') playerId: string) {
    return this.moderationService.block(currentPlayer.sub, playerId);
  }

  @Delete('blocks/:playerId')
  unblock(@CurrentPlayer() currentPlayer: JwtPayload, @Param('playerId') playerId: string) {
    return this.moderationService.unblock(currentPlayer.sub, playerId);
  }

  @Post('reports')
  createReport(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: CreateReportDto) {
    return this.moderationService.createReport(currentPlayer.sub, dto);
  }
}
