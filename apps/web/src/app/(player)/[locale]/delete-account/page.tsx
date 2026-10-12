'use client';

import { PublicPage } from '@/components/PublicPage';

// Public information page — no login required (owner decision, 2026-10-12).
export default function Page() {
  return <PublicPage pageKey="deleteAccount" />;
}
