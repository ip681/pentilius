import { Module } from '@nestjs/common';
import { AchievementsController } from '../achievements/achievements.controller';
import { AchievementsService } from '../achievements/achievements.service';
import { DailyTasksController } from '../daily-tasks/daily-tasks.controller';
import { DailyTasksService } from '../daily-tasks/daily-tasks.service';
import { ClanBonusService } from './clan-bonus.service';
import { EconomyService } from './economy.service';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  controllers: [PlayerController, DailyTasksController, AchievementsController],
  providers: [PlayerService, EconomyService, ClanBonusService, DailyTasksService, AchievementsService],
  exports: [EconomyService, ClanBonusService, DailyTasksService, AchievementsService],
})
export class PlayerModule {}
