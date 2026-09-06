import { Module } from '@nestjs/common';
import { PveModule } from '../pve/pve.module';
import { RobotController } from './robot.controller';
import { RobotService } from './robot.service';

@Module({
  imports: [PveModule],
  controllers: [RobotController],
  providers: [RobotService],
})
export class RobotModule {}
