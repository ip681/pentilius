import { IsInt, IsString, Max, Min } from 'class-validator';

export class SetVipDto {
  @IsString()
  username!: string;

  // 0 removes VIP; otherwise extends it by this many days (from now, or from
  // the current end if still active).
  @IsInt()
  @Min(0)
  @Max(3650)
  days!: number;
}
