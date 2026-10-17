import { ConfigService } from '@nestjs/config';
import { lookup } from 'geoip-lite';
import { PrismaService } from '../prisma/prisma.service';

/** Country code from an IP (null for local/private addresses or unknown ones). */
export function countryOf(ip: string | undefined): string | null {
  if (!ip) return null;
  const clean = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return lookup(clean)?.country ?? null;
}

/** The countries set in godmaster (owner decision, 2026-10-15: Bulgaria first). */
export async function allowedPaymentCountries(prisma: PrismaService): Promise<Set<string>> {
  const settings = await prisma.gameSettings.findUnique({ where: { id: 1 }, select: { paymentsAllowedCountries: true } });
  return new Set(
    (settings?.paymentsAllowedCountries ?? 'BG')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  );
}

/**
 * Whether real-money purchases are offered to this player now: payments are
 * switched on (a Stripe key is set) and the country is allowed. Unknown
 * countries (localhost) only with PAYMENTS_ALLOW_UNKNOWN_COUNTRY, i.e. in
 * local development.
 */
export async function paymentsOfferedTo(ip: string | undefined, prisma: PrismaService, config: ConfigService): Promise<boolean> {
  if (!config.get<string>('stripe.secretKey')) return false;
  const country = countryOf(ip);
  if (!country) return config.get<boolean>('payments.allowUnknownCountry') ?? false;
  return (await allowedPaymentCountries(prisma)).has(country);
}
