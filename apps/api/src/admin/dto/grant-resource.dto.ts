import { IsEnum, IsInt, IsString, Min } from 'class-validator';
import { ResourceType } from '@prisma/client';

export class GrantResourceDto {
  @IsString()
  username!: string;

  @IsEnum(ResourceType)
  resourceType!: ResourceType;

  @IsInt()
  @Min(1)
  amount!: number;
}
