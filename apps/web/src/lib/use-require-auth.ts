'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { isAuthenticated } from './auth';

/** Redirects to /login when there is no stored access token. Client-side only guard —
 * the API is what actually enforces authorization (see JwtAuthGuard on every module). */
export function useRequireAuth(): void {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
    }
  }, [router]);
}
