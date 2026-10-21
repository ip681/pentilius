import { IsArray, IsIn, IsISO8601, IsObject, IsString } from 'class-validator';

// godmaster → Announcements (owner decision, 2026-10-21). Texts and locales are checked further in the service.
export class SaveAnnouncementBodyDto {
  @IsIn(['INFO', 'IMPORTANT'])
  kind!: 'INFO' | 'IMPORTANT';

  @IsObject()
  texts!: Record<string, string>;

  @IsArray()
  @IsString({ each: true })
  locales!: string[];

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;
}
