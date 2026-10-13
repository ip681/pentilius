import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { DailyTasksService } from './daily-tasks.service';

@Controller('daily-tasks')
@UseGuards(JwtAuthGuard)
export class DailyTasksController {
  constructor(private readonly dailyTasks: DailyTasksService) {}

  @Get()
  getTasks(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.dailyTasks.getTasks(currentPlayer.sub);
  }

  // taskKey = a task's key, or "ALL_DONE" for the all-tasks bonus.
  @Post(':taskKey/claim')
  claim(@CurrentPlayer() currentPlayer: JwtPayload, @Param('taskKey') taskKey: string) {
    return this.dailyTasks.claim(currentPlayer.sub, taskKey);
  }
}
