import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class AddBannedWordDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  word!: string;

  @IsIn(['WHOLE_WORD', 'SUBSTRING'])
  match!: 'WHOLE_WORD' | 'SUBSTRING';
}

export class TestContentDto {
  @IsString()
  @MaxLength(1000)
  text!: string;
}
