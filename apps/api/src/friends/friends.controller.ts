import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { FriendsService } from './friends.service';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get()
  listFriends(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.friendsService.listFriends(currentPlayer.sub);
  }

  @Get('requests')
  listRequests(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.friendsService.listRequests(currentPlayer.sub);
  }

  @Get('unread')
  async getUnreadStatus(@CurrentPlayer() currentPlayer: JwtPayload) {
    return { hasUnread: await this.friendsService.hasAnyUnread(currentPlayer.sub) };
  }

  @Get('status/:playerId')
  getStatus(@CurrentPlayer() currentPlayer: JwtPayload, @Param('playerId') playerId: string) {
    return this.friendsService.getStatus(currentPlayer.sub, playerId);
  }

  @Post('request')
  sendRequest(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: SendFriendRequestDto) {
    return this.friendsService.sendRequest(currentPlayer.sub, dto.playerId);
  }

  @Post('accept/:requestId')
  acceptRequest(@CurrentPlayer() currentPlayer: JwtPayload, @Param('requestId') requestId: string) {
    return this.friendsService.acceptRequest(currentPlayer.sub, requestId);
  }

  // Same action from either side of a PENDING row: decline one you received, or cancel one you sent.
  @Post('decline/:requestId')
  declineRequest(@CurrentPlayer() currentPlayer: JwtPayload, @Param('requestId') requestId: string) {
    return this.friendsService.removeRequest(currentPlayer.sub, requestId);
  }

  @Post('remove/:playerId')
  removeFriend(@CurrentPlayer() currentPlayer: JwtPayload, @Param('playerId') playerId: string) {
    return this.friendsService.removeFriend(currentPlayer.sub, playerId);
  }

  @Get('messages/:playerId')
  getConversation(@CurrentPlayer() currentPlayer: JwtPayload, @Param('playerId') playerId: string) {
    return this.friendsService.getConversation(currentPlayer.sub, playerId);
  }

  @Post('messages/:playerId')
  sendMessage(@CurrentPlayer() currentPlayer: JwtPayload, @Param('playerId') playerId: string, @Body() dto: SendDirectMessageDto) {
    return this.friendsService.sendMessage(currentPlayer.sub, playerId, dto.text);
  }
}
