import { IsIn } from 'class-validator';

// Matches apps/web/src/i18n/routing.ts's locale list (instructions/I18N.md's
// starting pair) — no shared constant to import from the backend for this.
export class UpdateLocaleDto {
  @IsIn(['en', 'bg'])
  locale!: string;
}
