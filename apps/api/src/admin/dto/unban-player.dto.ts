import { IsString } from 'class-validator';

export class UnbanPlayerDto {
  @IsString()
  username!: string;
}
