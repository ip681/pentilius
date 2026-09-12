import { IsInt, IsString, Min } from 'class-validator';

export class GrantItemDto {
  @IsString()
  username!: string;

  @IsString()
  itemDefinitionKey!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
