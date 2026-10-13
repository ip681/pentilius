export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  // Web Push (owner decision, 2026-10-13) — our own VAPID keys; unset = push off.
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT ?? 'mailto:support@pentilius.com',
  },
  adminJwt: {
    secret: process.env.ADMIN_JWT_SECRET,
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN ?? '2h',
  },
});
