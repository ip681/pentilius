import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * The Stripe adapter (owner decision, 2026-10-15: Stripe Checkout, hosted
 * page, one-time payments). Everything Stripe-specific stays here; the rest of
 * the game only knows our own products and purchases.
 */
@Injectable()
export class StripeProvider {
  private readonly logger = new Logger(StripeProvider.name);
  private readonly client: Stripe | null;
  private readonly webhookSecret: string | undefined;

  constructor(config: ConfigService) {
    const secretKey = config.get<string>('stripe.secretKey');
    this.client = secretKey ? new Stripe(secretKey) : null;
    this.webhookSecret = config.get<string>('stripe.webhookSecret');
    if (!this.client) this.logger.warn('STRIPE_SECRET_KEY is not set — payments are off.');
  }

  get enabled(): boolean {
    return !!this.client;
  }

  async createCheckout(params: {
    priceId: string;
    productKey: string;
    playerId: string;
    email: string;
    successUrl: string;
    cancelUrl: string;
    locale: 'bg' | 'en';
  }): Promise<{ sessionId: string; url: string; amountCents: number; currency: string }> {
    const client = this.requireClient();
    const session = await client.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.email,
      locale: params.locale,
      // Lets us find the player and product even if our own row is missing.
      client_reference_id: params.playerId,
      metadata: { playerId: params.playerId, productKey: params.productKey },
    });
    if (!session.url) throw new ServiceUnavailableException('CHECKOUT_FAILED');
    return { sessionId: session.id, url: session.url, amountCents: session.amount_total ?? 0, currency: session.currency ?? 'eur' };
  }

  /** Verifies Stripe's signature; throws if the request isn't really from Stripe. */
  parseWebhook(rawBody: Buffer, signature: string): Stripe.Event {
    const client = this.requireClient();
    if (!this.webhookSecret) throw new ServiceUnavailableException('WEBHOOK_NOT_CONFIGURED');
    return client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }

  /** The paying card's country, for the Bulgaria-only check (null if unknown). */
  async cardCountry(paymentIntentId: string | null): Promise<string | null> {
    if (!paymentIntentId) return null;
    try {
      const intent = await this.requireClient().paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
      const charge = intent.latest_charge as Stripe.Charge | null;
      return charge?.payment_method_details?.card?.country ?? null;
    } catch (error) {
      this.logger.warn(`Could not read the card country: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * A price as Stripe has it — godmaster shows this, so the price in the game
   * can't drift from what Stripe charges. Null if it doesn't exist.
   */
  async retrievePrice(priceId: string): Promise<{ amountCents: number; currency: string; oneTime: boolean; active: boolean } | null> {
    try {
      const price = await this.requireClient().prices.retrieve(priceId);
      return { amountCents: price.unit_amount ?? 0, currency: price.currency, oneTime: price.type === 'one_time', active: price.active };
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) return null;
      throw error;
    }
  }

  /** Refunds the payment of a Checkout Session in full; Stripe then sends charge.refunded. */
  async refundSession(sessionId: string): Promise<void> {
    const client = this.requireClient();
    const session = await client.checkout.sessions.retrieve(sessionId);
    const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!paymentIntent) throw new ServiceUnavailableException('NOTHING_TO_REFUND');
    await client.refunds.create({ payment_intent: paymentIntent });
  }

  /** The Checkout Session that produced this payment (for refunds). */
  async sessionIdForPaymentIntent(paymentIntentId: string): Promise<string | null> {
    const sessions = await this.requireClient().checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
    return sessions.data[0]?.id ?? null;
  }

  private requireClient(): Stripe {
    if (!this.client) throw new ServiceUnavailableException('PAYMENTS_DISABLED');
    return this.client;
  }
}
