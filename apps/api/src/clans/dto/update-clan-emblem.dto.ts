import { IsInt, IsString, Max, Min } from 'class-validator';

// The leader's emblem pick (owner decision, 2026-10-21); ranges and palette keys are re-checked in clan-emblem.ts.
export class UpdateClanEmblemDto {
  @IsInt()
  @Min(1)
  @Max(1000)
  shape!: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  symbol!: number;

  @IsString()
  backgroundColor!: string;

  @IsString()
  symbolColor!: string;
}
