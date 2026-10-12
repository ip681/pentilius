import { IsInt, Max, Min } from 'class-validator';

export class UpdateGameSettingsDto {
  // 0 = delete at the next background run (within ~10 minutes).
  @IsInt()
  @Min(0)
  @Max(30)
  accountDeletionGraceDays!: number;

  // Days between the Core closing and the automatic season reset.
  @IsInt()
  @Min(0)
  @Max(30)
  seasonResetDelayDays!: number;
}
