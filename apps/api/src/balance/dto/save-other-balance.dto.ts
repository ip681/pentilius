import { IsObject } from 'class-validator';

export class SaveOtherBalanceDto {
  // { "pvp.minLevel": 5, … } — checked against OTHER_VALUES in AdminBalanceService.
  @IsObject()
  values!: Record<string, number>;
}
