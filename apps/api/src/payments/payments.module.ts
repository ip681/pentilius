import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminPaymentsService } from './admin-payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeProvider } from './stripe-provider';

/** Real-money purchases (owner decision, 2026-10-15). New providers are new adapters next to StripeProvider. */
@Module({
  imports: [PlayerModule],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentsService, StripeProvider, AdminPaymentsService],
})
export class PaymentsModule {}
