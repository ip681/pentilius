import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ItemIdsDto {
  // Selling/recycling several set items at once (owner decision, 2026-10-20); the service also caps it.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  itemInstanceIds!: string[];
}
