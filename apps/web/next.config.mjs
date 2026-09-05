import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // next/image's optimizer requires the `sharp` package in production, which
  // this project deliberately doesn't install. Assets are pre-sized instead
  // (see apps/web/public/logo.png, apps/web/src/app/icon.png).
  images: { unoptimized: true },
};

export default withNextIntl(nextConfig);
