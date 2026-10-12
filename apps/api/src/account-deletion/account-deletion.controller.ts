import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { AccountDeletionService } from './account-deletion.service';
import { RequestDeletionDto } from './dto/request-deletion.dto';

@Controller('player/me/deletion')
@UseGuards(JwtAuthGuard)
export class AccountDeletionController {
  constructor(private readonly accountDeletion: AccountDeletionService) {}

  @Get()
  getStatus(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.accountDeletion.getStatus(currentPlayer.sub);
  }

  @Post('code')
  issueCode(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.accountDeletion.issueCode(currentPlayer.sub);
  }

  @Post()
  requestDeletion(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: RequestDeletionDto) {
    return this.accountDeletion.requestDeletion(currentPlayer.sub, dto.password, dto.code);
  }

  @Post('cancel')
  cancelDeletion(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.accountDeletion.cancelDeletion(currentPlayer.sub);
  }
}
