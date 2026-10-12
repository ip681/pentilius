import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ResolveReportsDto {
  // One report, or a whole group (e.g. every open report against one player).
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  reportIds!: string[];

  @IsIn(['RESOLVED', 'DISMISSED'])
  status!: 'RESOLVED' | 'DISMISSED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
