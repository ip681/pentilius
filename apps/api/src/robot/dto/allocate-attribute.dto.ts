import { IsIn } from 'class-validator';

export class AllocateAttributeDto {
  @IsIn(['damage', 'defense', 'hp', 'evasion'])
  stat!: 'damage' | 'defense' | 'hp' | 'evasion';
}
