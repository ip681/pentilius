import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const CATEGORIES = ['IDEA', 'BUG', 'QUESTION', 'OTHER'] as const;
const STATUSES = ['OPEN', 'ANSWERED', 'CLOSED'] as const;

// Hard caps here; the service also trims to GAME_BALANCE.support.maxMessageLength.
export class CreateSupportTicketDto {
  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  @IsString()
  @MaxLength(4000)
  text!: string;
}

export class SupportMessageDto {
  @IsString()
  @MaxLength(4000)
  text!: string;
}

export class SupportListQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: (typeof CATEGORIES)[number];
}
