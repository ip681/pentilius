import { IsUUID } from 'class-validator';

export class AttackOpponentDto {
  @IsUUID()
  opponentId!: string;
}
