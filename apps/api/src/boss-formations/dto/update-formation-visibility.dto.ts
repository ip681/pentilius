import { IsBoolean } from 'class-validator';

export class UpdateFormationVisibilityDto {
  @IsBoolean()
  visibleToClanOnly!: boolean;

  @IsBoolean()
  visibleToFriendsOnly!: boolean;
}
