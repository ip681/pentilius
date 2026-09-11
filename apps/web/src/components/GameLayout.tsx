'use client';

import type { PlayerProfileDto } from '@pentilius/shared';
import { useLocale } from 'next-intl';
import { useEffect, useLayoutEffect, useState } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { getProfile } from '@/lib/api-client';
import { clearTokens, isAuthenticated } from '@/lib/auth';
import { onProfileChanged } from '@/lib/profile-events';
import { getCachedProfile, setCachedProfile } from '@/lib/profile-cache';
import { useFriendsUnread } from '@/lib/use-friends-unread';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function GameLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<PlayerProfileDto | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const hasUnreadFriends = useFriendsUnread();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function loadProfile() {
    getProfile()
      .then((data) => {
        setProfile(data);
        setLoggedIn(true);
        setCachedProfile(data);
      })
      .catch(() => {
        // Stored token is missing/expired — treat as logged out rather than showing dead chrome.
        clearTokens();
        setLoggedIn(false);
      });
  }

  // Shows the last-known profile immediately, before the network round-trip
  // below resolves — runs before paint so there's no visible flash between
  // "no profile" and "cached profile". The real fetch overwrites it moments
  // later; this is purely cosmetic, never treated as authoritative data.
  useLayoutEffect(() => {
    if (!isAuthenticated()) return;
    const cached = getCachedProfile();
    if (cached) {
      setProfile(cached);
      setLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      setLoggedIn(false);
      return;
    }
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any page that spends energy (PvE/PvP attacks, etc.) fetches its own copy
  // of the profile for its own display — this keeps the TopBar's energy bar
  // in sync with those actions without lifting state into a shared context.
  useEffect(() => onProfileChanged(loadProfile), []);

  // Re-fetch once, exactly when the next Action Energy point is due, so the
  // bar/countdown self-corrects without continuous polling.
  useEffect(() => {
    if (!profile?.energy.nextRegenAt) return;
    const delayMs = new Date(profile.energy.nextRegenAt).getTime() - Date.now() + 1000;
    if (delayMs <= 0) return;
    const timeout = setTimeout(loadProfile, delayMs);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.energy.nextRegenAt]);

  // "Always opens in that language until changed" (Settings) — every load
  // lands on the saved preference, not just right after login. A no-op once
  // the URL locale already matches, so this can't loop.
  useEffect(() => {
    if (profile?.preferredLocale && profile.preferredLocale !== locale) {
      router.replace(pathname, { locale: profile.preferredLocale });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.preferredLocale, locale]);

  return (
    <div className="min-h-screen bg-ink text-text">
      <TopBar profile={profile} loggedIn={loggedIn} />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <Sidebar hasUnreadFriends={hasUnreadFriends} />
        <main className="w-full max-w-[1500px] flex-1 px-4 pb-20 pt-4 md:p-7">{children}</main>
      </div>
      {loggedIn && <BottomNav hasUnreadFriends={hasUnreadFriends} />}
    </div>
  );
}
