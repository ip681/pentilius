import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { BaseController } from './base.controller';
import { BaseService } from './base.service';

@Module({
  imports: [PlayerModule],
  controllers: [BaseController],
  providers: [BaseService],
})
export class BaseModule {}
