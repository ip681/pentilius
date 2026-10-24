import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProductDto, PaymentsCatalogDto, PurchaseDto, SaleDocumentDto } from '@pentilius/shared';
import { PaymentProduct, Prisma, Purchase, SaleDocumentKind } from '@prisma/client';
import Stripe from 'stripe';
import { refreshEnergyBonuses } from '../base/building-finalizer';
import { PushService } from '../notifications/push.service';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';
import { allowedPaymentCountries, countryOf, paymentsOfferedTo } from './payment-country';
import { issueRefundDocument, issueSaleDocument, loadSellerInfo, missingSellerFields, toSaleDocumentDto } from './sale-documents';
import { StripeProvider } from './stripe-provider';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Real-money purchases (owner decision, 2026-10-15). Phase 1: Stripe on the
 * web, one-time payments (Credits packs, VIP one month at a time), in the
 * countries set in godmaster (Bulgaria first). A purchase is granted only
 * after the provider confirms it, exactly once; a refund takes it back.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly appBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeProvider,
    private readonly economy: EconomyService,
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {
    this.appBaseUrl = config.get<string>('email.appBaseUrl') ?? 'https://pentilius.com';
  }

  /** What this player can buy now; empty (available: false) when payments are off or the country isn't allowed. */
  async getCatalog(ip: string | undefined): Promise<PaymentsCatalogDto> {
    if (!(await paymentsOfferedTo(ip, this.prisma, this.config))) return { available: false, products: [] };
    const products = await this.prisma.paymentProduct.findMany({ where: { active: true, stripePriceId: { not: null } }, orderBy: { sortOrder: 'asc' } });
    return { available: products.length > 0, products: products.map(toProductDto) };
  }

  /** Starts a Stripe Checkout and returns where to send the player. */
  async startCheckout(playerId: string, productKey: string, locale: 'bg' | 'en', ip: string | undefined): Promise<{ url: string }> {
    if (!(await paymentsOfferedTo(ip, this.prisma, this.config))) throw new ForbiddenException('PAYMENTS_NOT_AVAILABLE');
    const product = await this.prisma.paymentProduct.findUnique({ where: { key: productKey } });
    if (!product || !product.active || !product.stripePriceId) throw new NotFoundException('PRODUCT_NOT_AVAILABLE');
    // Real money needs a complete seller for the sale documents (Наредба Н-18); test payments don't.
    if (this.stripe.live && missingSellerFields(await loadSellerInfo(this.prisma)).length > 0) {
      throw new ForbiddenException('PAYMENTS_NOT_CONFIGURED');
    }
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId }, select: { email: true } });

    // Back to the Shop's offers; Stripe fills in {CHECKOUT_SESSION_ID} and the shop waits for the confirmation.
    const shopUrl = `${this.appBaseUrl}/${locale}/shop`;
    const checkout = await this.stripe.createCheckout({
      priceId: product.stripePriceId,
      productKey: product.key,
      playerId,
      email: player.email,
      successUrl: `${shopUrl}?checkout={CHECKOUT_SESSION_ID}#offers`,
      cancelUrl: `${shopUrl}?checkout=canceled#offers`,
      locale,
    });
    await this.prisma.purchase.create({
      data: {
        playerId,
        productId: product.id,
        provider: 'STRIPE',
        providerRef: checkout.sessionId,
        amountCents: checkout.amountCents,
        currency: checkout.currency,
        credits: product.credits,
        vipDays: product.vipDays,
        ipCountry: countryOf(ip),
      },
    });
    return { url: checkout.url };
  }

  /** The state of one checkout, for the "processing…" message after returning from Stripe. */
  async getCheckoutStatus(playerId: string, sessionId: string): Promise<PurchaseDto> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { provider_providerRef: { provider: 'STRIPE', providerRef: sessionId } },
      include: PURCHASE_INCLUDE,
    });
    if (!purchase || purchase.playerId !== playerId) throw new NotFoundException('PURCHASE_NOT_FOUND');
    return toPurchaseDto(purchase);
  }

  async listPurchases(playerId: string): Promise<PurchaseDto[]> {
    const purchases = await this.prisma.purchase.findMany({
      where: { playerId, status: { in: ['COMPLETED', 'REFUNDED'] } },
      include: PURCHASE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return purchases.map(toPurchaseDto);
  }

  /** One of the player's own sale or refund documents (Наредба Н-18, чл. 52о, ал. 5: given electronically). */
  async getDocument(playerId: string, documentId: string): Promise<SaleDocumentDto> {
    const doc = await this.prisma.saleDocument.findUnique({ where: { id: documentId }, include: { purchase: { select: { playerId: true } }, sale: true } });
    if (!doc || doc.purchase.playerId !== playerId) throw new NotFoundException('DOCUMENT_NOT_FOUND');
    return toSaleDocumentDto(doc);
  }

  /** Stripe's notifications. Repeats are harmless: every change is conditional on the current status. */
  async handleStripeWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<void> {
    if (!rawBody || !signature) throw new BadRequestException('INVALID_WEBHOOK');
    let event: Stripe.Event;
    try {
      event = this.stripe.parseWebhook(rawBody, signature);
    } catch (error) {
      this.logger.warn(`Rejected a Stripe webhook: ${(error as Error).message}`);
      throw new BadRequestException('INVALID_SIGNATURE');
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        // Some methods complete later — wait for async_payment_succeeded.
        if (session.payment_status === 'paid') await this.completeStripeSession(session);
        break;
      }
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.prisma.purchase.updateMany({
          where: { provider: 'STRIPE', providerRef: session.id, status: 'PENDING' },
          data: { status: 'CANCELED' },
        });
        break;
      }
      case 'charge.dispute.closed': {
        // A lost dispute: the money went back to the customer, so the purchase is taken back.
        const dispute = event.data.object as Stripe.Dispute;
        if (dispute.status === 'lost' && typeof dispute.payment_intent === 'string') {
          const sessionId = await this.stripe.sessionIdForPaymentIntent(dispute.payment_intent);
          if (sessionId) await this.takeBack('STRIPE', sessionId);
        }
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        // Only a full refund takes the purchase back; partial refunds are handled by hand.
        if (charge.refunded && typeof charge.payment_intent === 'string') {
          const sessionId = await this.stripe.sessionIdForPaymentIntent(charge.payment_intent);
          if (sessionId) await this.takeBack('STRIPE', sessionId);
        }
        break;
      }
      default:
        break;
    }
  }

  private async completeStripeSession(session: Stripe.Checkout.Session): Promise<void> {
    let purchase = await this.prisma.purchase.findUnique({
      where: { provider_providerRef: { provider: 'STRIPE', providerRef: session.id } },
    });
    // Our row can be missing if saving it failed right after Stripe created the
    // session — rebuild it from the session's metadata so a paid order is never lost.
    if (!purchase) {
      const product = session.metadata?.productKey ? await this.prisma.paymentProduct.findUnique({ where: { key: session.metadata.productKey } }) : null;
      const playerId = session.metadata?.playerId ?? session.client_reference_id;
      if (!product || !playerId) {
        this.logger.error(`Paid Stripe session ${session.id} has no matching product/player — needs manual review.`);
        return;
      }
      purchase = await this.prisma.purchase.upsert({
        where: { provider_providerRef: { provider: 'STRIPE', providerRef: session.id } },
        update: {},
        create: {
          playerId,
          productId: product.id,
          provider: 'STRIPE',
          providerRef: session.id,
          amountCents: session.amount_total ?? 0,
          currency: session.currency ?? 'eur',
          credits: product.credits,
          vipDays: product.vipDays,
        },
      });
    }
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null);
    const { cardCountry, chargeId } = await this.stripe.paymentDetails(paymentIntentId);
    await this.grant(purchase.id, { cardCountry, chargeId, paymentIntentId, livemode: session.livemode });
  }

  /**
   * Grants a pending purchase exactly once (the status check makes repeats
   * no-ops) and issues its sale document in the same transaction, so a paid
   * order and its document can't exist without each other.
   */
  private async grant(
    purchaseId: string,
    payment: { cardCountry: string | null; chargeId: string | null; paymentIntentId: string | null; livemode: boolean },
  ): Promise<void> {
    const { cardCountry } = payment;
    const granted = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.purchase.updateMany({
        where: { id: purchaseId, status: 'PENDING' },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          cardCountry,
          chargeId: payment.chargeId,
          paymentIntentId: payment.paymentIntentId,
          livemode: payment.livemode,
        },
      });
      if (claimed.count !== 1) return null;
      const purchase = await tx.purchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { product: true } });
      await this.applyGrant(tx, purchase, 1);
      await issueSaleDocument(tx, purchase, purchase.product);
      return purchase;
    });
    if (!granted) return;
    const allowed = await allowedPaymentCountries(this.prisma);
    if (cardCountry && !allowed.has(cardCountry.toUpperCase())) {
      // Granted anyway (it's paid) — shown in godmaster for review.
      this.logger.warn(`Purchase ${purchaseId} was paid with a card from ${cardCountry} (outside the allowed countries).`);
    }
    if (granted.vipDays) await refreshEnergyBonuses({ prisma: this.prisma, economy: this.economy, push: this.push }, granted.playerId);
  }

  /** Takes a completed purchase back after a full refund. */
  async takeBack(provider: 'STRIPE', providerRef: string): Promise<boolean> {
    const refunded = await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { provider_providerRef: { provider, providerRef } } });
      if (!purchase) return null;
      const claimed = await tx.purchase.updateMany({ where: { id: purchase.id, status: 'COMPLETED' }, data: { status: 'REFUNDED', refundedAt: new Date() } });
      if (claimed.count !== 1) return null;
      await this.applyGrant(tx, purchase, -1);
      await issueRefundDocument(tx, purchase);
      return purchase;
    });
    if (refunded?.vipDays) await refreshEnergyBonuses({ prisma: this.prisma, economy: this.economy, push: this.push }, refunded.playerId);
    return !!refunded;
  }

  /**
   * Adds (direction 1) or takes back (-1) what the purchase granted — its own
   * snapshot, not the product's current values.
   * - Credits: taken back in full, even below 0 (owner decision, 2026-10-23):
   *   with a negative balance nothing can be bought with Credits until it's
   *   positive again, so a refund can't leave free Credits behind.
   * - VIP: extends from the current end (or now); a refund shortens it, never
   *   below now.
   */
  private async applyGrant(tx: Prisma.TransactionClient, purchase: Purchase, direction: 1 | -1): Promise<void> {
    if (purchase.credits) {
      await this.economy.settleAll(purchase.playerId, tx);
      await tx.player.update({ where: { id: purchase.playerId }, data: { credits: { increment: direction * purchase.credits } } });
    }
    if (purchase.vipDays) {
      const player = await tx.player.findUniqueOrThrow({ where: { id: purchase.playerId }, select: { vipUntil: true } });
      const now = Date.now();
      const current = player.vipUntil ? player.vipUntil.getTime() : now;
      const next = direction === 1 ? Math.max(current, now) + purchase.vipDays * DAY_MS : current - purchase.vipDays * DAY_MS;
      await tx.player.update({ where: { id: purchase.playerId }, data: { vipUntil: next > now ? new Date(next) : null } });
    }
  }
}

function toProductDto(product: PaymentProduct): PaymentProductDto {
  return {
    key: product.key,
    nameBg: product.nameBg,
    nameEn: product.nameEn,
    kind: product.kind,
    credits: product.credits,
    vipDays: product.vipDays,
    priceCents: product.priceCents,
    currency: product.currency,
  };
}

const PURCHASE_INCLUDE = { product: true, documents: { select: { id: true, kind: true } } } as const;

function toPurchaseDto(purchase: Purchase & { product: PaymentProduct; documents: { id: string; kind: SaleDocumentKind }[] }): PurchaseDto {
  return {
    id: purchase.id,
    productKey: purchase.product.key,
    nameBg: purchase.product.nameBg,
    nameEn: purchase.product.nameEn,
    credits: purchase.credits,
    vipDays: purchase.vipDays,
    kind: purchase.product.kind,
    status: purchase.status,
    amountCents: purchase.amountCents,
    currency: purchase.currency,
    createdAt: purchase.createdAt.toISOString(),
    completedAt: purchase.completedAt?.toISOString() ?? null,
    saleDocumentId: purchase.documents.find((d) => d.kind === 'SALE')?.id ?? null,
    refundDocumentId: purchase.documents.find((d) => d.kind === 'REFUND')?.id ?? null,
  };
}
