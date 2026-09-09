import { IsString } from 'class-validator';

export class UpdateFrameDto {
  @IsString()
  frameKey!: string;
}
