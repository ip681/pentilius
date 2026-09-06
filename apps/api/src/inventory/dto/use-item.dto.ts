import { IsOptional, IsString } from 'class-validator';

export class UseItemDto {
  // Required only for consumables whose effect targets a specific building (e.g. a construction speedup).
  @IsOptional()
  @IsString()
  buildingKey?: string;
}
