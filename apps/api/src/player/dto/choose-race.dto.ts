import { Race } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ChooseRaceDto {
  @IsEnum(Race)
  race!: Race;
}
