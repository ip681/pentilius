import { Module } from '@nestjs/common';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { AchievementsController } from '../achievements/achievements.controller';
import { AchievementsService } from '../achievements/achievements.service';
import { DailyTasksController } from '../daily-tasks/daily-tasks.controller';
import { NotificationsController } from '../notifications/notifications.controller';
import { PushSchedulerService } from '../notifications/push-scheduler.service';
import { PushService } from '../notifications/push.service';
import { DailyTasksService } from '../daily-tasks/daily-tasks.service';
import { ClanBonusService } from './clan-bonus.service';
import { EconomyService } from './economy.service';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [AnnouncementsModule],
  controllers: [PlayerController, DailyTasksController, AchievementsController, NotificationsController],
  providers: [PlayerService, EconomyService, ClanBonusService, DailyTasksService, AchievementsService, PushService, PushSchedulerService],
  exports: [EconomyService, ClanBonusService, DailyTasksService, AchievementsService, PushService],
})
export class PlayerModule {}
