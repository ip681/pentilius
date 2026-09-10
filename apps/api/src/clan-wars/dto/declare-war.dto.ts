import { IsUUID } from 'class-validator';

export class DeclareWarDto {
  @IsUUID()
  targetClanId!: string;
}
