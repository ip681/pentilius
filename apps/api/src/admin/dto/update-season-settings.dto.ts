import { IsDateString, IsInt, Max, Min } from 'class-validator';

export class UpdateSeasonSettingsDto {
  // ISO 8601 with offset/Z — stored as UTC.
  @IsDateString()
  coreOpensAt!: string;

  @IsInt()
  @Min(1)
  @Max(365)
  coreDurationDays!: number;
}
