import { IsBoolean } from 'class-validator';

export class SetAdminActiveDto {
  @IsBoolean()
  active!: boolean;
}
