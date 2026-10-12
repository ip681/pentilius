import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateReportDto {
  @IsIn(['PLAYER', 'CLAN', 'CLAN_MESSAGE', 'DIRECT_MESSAGE'])
  targetType!: 'PLAYER' | 'CLAN' | 'CLAN_MESSAGE' | 'DIRECT_MESSAGE';

  @IsUUID()
  targetId!: string;

  @IsIn(['HARASSMENT', 'OFFENSIVE_CONTENT', 'SPAM', 'CHEATING', 'OTHER'])
  reason!: 'HARASSMENT' | 'OFFENSIVE_CONTENT' | 'SPAM' | 'CHEATING' | 'OTHER';

  // Hard cap here; the service also trims to GAME_BALANCE.moderation.maxCommentLength.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
