import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminPaymentProductDto, AdminPaymentsSettingsDto, AdminPurchaseDto, AdminPurchasesResponseDto } from '@pentilius/shared';
import { AdminActionType, PaymentProduct, Prisma } from '@prisma/client';
import { AdminJwtPayload } from '../admin/admin-jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { SavePaymentProductDto, UpdatePaymentsSettingsDto } from './dto/admin-payments.dto';
import { allowedPaymentCountries } from './payment-country';
import { PaymentsService } from './payments.service';
import { StripeProvider } from './stripe-provider';

/**
 * Payments in godmaster (owner decision, 2026-10-17): products, purchases with
 * refunds, and the allowed countries. ADMIN only; every change is logged.
 * The Stripe keys never appear here — they stay in the server's environment.
 */
@Injectable()
export class AdminPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeProvider,
    private readonly payments: PaymentsService,
  ) {}

  async listProducts(admin: AdminJwtPayload): Promise<AdminPaymentProductDto[]> {
    assertAdmin(admin);
    const products = await this.prisma.paymentProduct.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { purchases: true } } } });
    return products.map((p) => toAdminProductDto(p, p._count.purchases));
  }

  /** Creates a product or updates one (by key). The kind can't change once created. */
  async saveProduct(dto: SavePaymentProductDto, admin: AdminJwtPayload): Promise<AdminPaymentProductDto> {
    assertAdmin(admin);
    if (dto.kind === 'CREDITS' && !(dto.credits && dto.credits > 0)) throw new BadRequestException('CREDITS_REQUIRED');
    if (dto.kind === 'VIP' && !(dto.vipDays && dto.vipDays > 0)) throw new BadRequestException('VIP_DAYS_REQUIRED');

    // The price shown in the game always comes from Stripe, never typed by hand.
    let price: { priceCents: number; currency: string } | null = null;
    const priceId = dto.stripePriceId?.trim() || null;
    if (priceId) {
      const stripePrice = await this.stripe.retrievePrice(priceId);
      if (!stripePrice) throw new BadRequestException('STRIPE_PRICE_NOT_FOUND');
      if (!stripePrice.oneTime) throw new BadRequestException('STRIPE_PRICE_NOT_ONE_TIME');
      if (!stripePrice.active) throw new BadRequestException('STRIPE_PRICE_INACTIVE');
      price = { priceCents: stripePrice.amountCents, currency: stripePrice.currency };
    }

    const existing = await this.prisma.paymentProduct.findUnique({ where: { key: dto.key } });
    if (existing && existing.kind !== dto.kind) throw new BadRequestException('KIND_CANNOT_CHANGE');
    const data = {
      nameBg: dto.nameBg.trim(),
      nameEn: dto.nameEn.trim(),
      kind: dto.kind,
      credits: dto.kind === 'CREDITS' ? dto.credits! : null,
      vipDays: dto.kind === 'VIP' ? dto.vipDays! : null,
      stripePriceId: priceId,
      priceCents: price?.priceCents ?? existing?.priceCents ?? 0,
      currency: price?.currency ?? existing?.currency ?? 'eur',
      sortOrder: dto.sortOrder ?? existing?.sortOrder ?? 0,
      active: dto.active ?? existing?.active ?? true,
    };
    try {
      const saved = await this.prisma.$transaction(async (tx) => {
        const product = existing
          ? await tx.paymentProduct.update({ where: { id: existing.id }, data })
          : await tx.paymentProduct.create({ data: { key: dto.key, ...data } });
        await log(tx, admin, existing ? 'UPDATE_PAYMENT_PRODUCT' : 'CREATE_PAYMENT_PRODUCT', { key: dto.key, ...data });
        return product;
      });
      const purchases = await this.prisma.purchase.count({ where: { productId: saved.id } });
      return toAdminProductDto(saved, purchases);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('STRIPE_PRICE_ALREADY_USED');
      throw error;
    }
  }

  /** Purchases, newest first, with a search by username and the totals for today and this month. */
  async listPurchases(admin: AdminJwtPayload, filter: { search?: string; status?: string; flagged?: boolean }): Promise<AdminPurchasesResponseDto> {
    assertAdmin(admin);
    const allowed = await allowedPaymentCountries(this.prisma);
    const where: Prisma.PurchaseWhereInput = {
      ...(filter.status ? { status: filter.status as Prisma.EnumPurchaseStatusFilter['equals'] } : { status: { not: 'PENDING' } }),
      ...(filter.search ? { player: { username: { contains: filter.search, mode: 'insensitive' } } } : {}),
    };
    const rows = await this.prisma.purchase.findMany({
      where,
      include: { product: true, player: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const list: AdminPurchaseDto[] = rows
      .map((p) => ({
        id: p.id,
        username: p.player.username,
        productNameBg: p.product.nameBg,
        status: p.status,
        amountCents: p.amountCents,
        currency: p.currency,
        credits: p.credits,
        vipDays: p.vipDays,
        ipCountry: p.ipCountry,
        cardCountry: p.cardCountry,
        // A card from outside the allowed countries — paid and granted, but worth a look.
        flagged: !!p.cardCountry && !allowed.has(p.cardCountry.toUpperCase()),
        createdAt: p.createdAt.toISOString(),
        completedAt: p.completedAt?.toISOString() ?? null,
        refundedAt: p.refundedAt?.toISOString() ?? null,
      }))
      .filter((p) => !filter.flagged || p.flagged);

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [today, month] = await Promise.all([this.revenueSince(dayStart), this.revenueSince(monthStart)]);
    return { purchases: list, todayCents: today, monthCents: month };
  }

  /** Refunds through Stripe and takes the purchase back right away (Stripe's own notice then changes nothing). */
  async refund(purchaseId: string, admin: AdminJwtPayload): Promise<void> {
    assertAdmin(admin);
    const purchase = await this.prisma.purchase.findUnique({ where: { id: purchaseId }, include: { player: { select: { id: true, username: true } } } });
    if (!purchase) throw new NotFoundException('PURCHASE_NOT_FOUND');
    if (purchase.status !== 'COMPLETED') throw new BadRequestException('NOT_REFUNDABLE');
    await this.stripe.refundSession(purchase.providerRef);
    await this.payments.takeBack('STRIPE', purchase.providerRef);
    await this.prisma.$transaction((tx) =>
      log(tx, admin, 'REFUND_PURCHASE', { purchaseId, amountCents: purchase.amountCents, currency: purchase.currency }, purchase.player),
    );
  }

  async getSettings(admin: AdminJwtPayload): Promise<AdminPaymentsSettingsDto> {
    assertAdmin(admin);
    return { allowedCountries: [...(await allowedPaymentCountries(this.prisma))], paymentsEnabled: this.stripe.enabled };
  }

  async updateSettings(dto: UpdatePaymentsSettingsDto, admin: AdminJwtPayload): Promise<AdminPaymentsSettingsDto> {
    assertAdmin(admin);
    const countries = [...new Set(dto.allowedCountries.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))];
    await this.prisma.$transaction(async (tx) => {
      await tx.gameSettings.upsert({
        where: { id: 1 },
        update: { paymentsAllowedCountries: countries.join(',') },
        create: { id: 1, paymentsAllowedCountries: countries.join(',') },
      });
      await log(tx, admin, 'UPDATE_PAYMENT_SETTINGS', { allowedCountries: countries });
    });
    return this.getSettings(admin);
  }

  /** Completed minus refunded, in cents (one currency for now: EUR). */
  private async revenueSince(since: Date): Promise<number> {
    const [paid, refunded] = await Promise.all([
      this.prisma.purchase.aggregate({ where: { status: { in: ['COMPLETED', 'REFUNDED'] }, completedAt: { gte: since } }, _sum: { amountCents: true } }),
      this.prisma.purchase.aggregate({ where: { status: 'REFUNDED', refundedAt: { gte: since } }, _sum: { amountCents: true } }),
    ]);
    return (paid._sum.amountCents ?? 0) - (refunded._sum.amountCents ?? 0);
  }
}

function assertAdmin(admin: AdminJwtPayload): void {
  if (admin.role !== 'ADMIN') throw new ForbiddenException('ADMIN_ROLE_REQUIRED');
}

async function log(
  tx: Prisma.TransactionClient,
  admin: AdminJwtPayload,
  actionType: AdminActionType,
  details: Record<string, unknown>,
  target: { id: string; username: string } | null = null,
): Promise<void> {
  await tx.adminActionLog.create({
    data: {
      adminId: admin.sub,
      adminUsername: admin.username,
      actionType,
      targetPlayerId: target?.id ?? null,
      targetUsername: target?.username ?? null,
      details: details as Prisma.InputJsonValue,
    },
  });
}

function toAdminProductDto(product: PaymentProduct, purchaseCount: number): AdminPaymentProductDto {
  return {
    key: product.key,
    nameBg: product.nameBg,
    nameEn: product.nameEn,
    kind: product.kind,
    credits: product.credits,
    vipDays: product.vipDays,
    stripePriceId: product.stripePriceId,
    priceCents: product.priceCents,
    currency: product.currency,
    sortOrder: product.sortOrder,
    active: product.active,
    purchaseCount,
  };
}
