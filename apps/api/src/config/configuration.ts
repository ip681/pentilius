export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  // Transactional email via Brevo (owner decision, 2026-10-13); no key = log only.
  email: {
    brevoApiKey: process.env.BREVO_API_KEY,
    from: process.env.EMAIL_FROM ?? 'no-reply@pentilius.com',
    fromName: process.env.EMAIL_FROM_NAME ?? 'Pentilius',
    // Base URL used in emailed links.
    appBaseUrl: process.env.APP_BASE_URL ?? 'https://pentilius.com',
  },
  // Web Push (owner decision, 2026-10-13) — our own VAPID keys; unset = push off.
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT ?? 'mailto:support@pentilius.com',
  },
  // Payments (owner decision, 2026-10-15) — no key = payments off.
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  payments: {
    // The allowed countries are set in godmaster (GameSettings).
    // Local development has no country (localhost) — allow it there only.
    allowUnknownCountry: process.env.PAYMENTS_ALLOW_UNKNOWN_COUNTRY === 'true',
  },
  adminJwt: {
    secret: process.env.ADMIN_JWT_SECRET,
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN ?? '2h',
  },
});
