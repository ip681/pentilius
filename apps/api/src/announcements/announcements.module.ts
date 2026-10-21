import { Module } from '@nestjs/common';
import { AdminAnnouncementsController, PlayerAnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

/** Staff announcements (owner decision, 2026-10-21). */
@Module({
  controllers: [PlayerAnnouncementsController, AdminAnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
