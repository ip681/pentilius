import { IsString, MaxLength, MinLength } from 'class-validator';
import { GAME_BALANCE } from '../../config/game-config';

export class SendClanMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(GAME_BALANCE.clanChat.maxMessageLength)
  text!: string;
}
