import { IsString, MaxLength } from 'class-validator';

export class UpdateBioDto {
  @IsString()
  @MaxLength(280)
  bio!: string;
}
