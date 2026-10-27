import { Matches } from 'class-validator';

/** A new name — the same format as registering (RegisterDto.username). */
export class ChangeNameDto {
  @Matches(/^[a-zA-Z0-9_]{3,20}$/)
  username!: string;
}
