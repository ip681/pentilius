import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateFormationDto {
  @IsString()
  bossKey!: string;

  @IsOptional()
  @IsBoolean()
  visibleToClanOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  visibleToFriendsOnly?: boolean;
}
