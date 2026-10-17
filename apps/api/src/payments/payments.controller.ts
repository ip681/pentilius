import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Ip, Param, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { StartCheckoutDto } from './dto/start-checkout.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('products')
  getCatalog(@Ip() ip: string) {
    return this.payments.getCatalog(ip);
  }

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  startCheckout(@CurrentPlayer() player: JwtPayload, @Body() dto: StartCheckoutDto, @Ip() ip: string) {
    return this.payments.startCheckout(player.sub, dto.productKey, dto.locale === 'en' ? 'en' : 'bg', ip);
  }

  @UseGuards(JwtAuthGuard)
  @Get('checkout/:sessionId')
  getCheckoutStatus(@CurrentPlayer() player: JwtPayload, @Param('sessionId') sessionId: string) {
    return this.payments.getCheckoutStatus(player.sub, sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('purchases')
  listPurchases(@CurrentPlayer() player: JwtPayload) {
    return this.payments.listPurchases(player.sub);
  }

  // Called by Stripe, not by players — no login; the signature proves it's Stripe.
  @Post('stripe/webhook')
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string | undefined) {
    await this.payments.handleStripeWebhook(req.rawBody, signature);
    return { received: true };
  }
}
