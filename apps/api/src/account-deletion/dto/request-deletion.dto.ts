import { IsString, MaxLength } from 'class-validator';

export class RequestDeletionDto {
  @IsString()
  password!: string;

  @IsString()
  @MaxLength(20)
  code!: string;
}
