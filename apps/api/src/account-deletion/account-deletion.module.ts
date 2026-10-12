import { Module } from '@nestjs/common';
import { ClansModule } from '../clans/clans.module';
import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionService } from './account-deletion.service';

@Module({
  imports: [ClansModule],
  controllers: [AccountDeletionController],
  providers: [AccountDeletionService],
})
export class AccountDeletionModule {}
