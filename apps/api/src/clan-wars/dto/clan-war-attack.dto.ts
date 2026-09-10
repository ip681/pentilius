import { IsUUID } from 'class-validator';

export class ClanWarAttackDto {
  @IsUUID()
  defenderId!: string;
}
