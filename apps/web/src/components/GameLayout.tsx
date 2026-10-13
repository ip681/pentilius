'use client';

import type { PlayerProfileDto } from '@pentilius/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useState } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cancelAccountDeletion, checkSeason, getProfile } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-datetime';
import { clearTokens, isAuthenticated } from '@/lib/auth';
import { onProfileChanged } from '@/lib/profile-events';
import { getCachedProfile, setCachedProfile } from '@/lib/profile-cache';
import { useFriendsUnread } from '@/lib/use-friends-unread';
import { useNotifications } from '@/lib/use-notifications';
import { NotificationCenter } from '@/components/NotificationCenter';
import { BottomNav } from './BottomNav';
import { RaceSelectModal } from './RaceSelectModal';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { forgetDevicePush } from '@/lib/push';

export function GameLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<PlayerProfileDto | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const hasUnreadFriends = useFriendsUnread();
  const notifications = useNotifications(loggedIn);
  const locale = useLocale();
  const t = useTranslations();
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
        void forgetDevicePush();
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

  // Season reset (owner decision, 2026-10-13): count down on every page; at
  // zero ask the server to start the new season (it checks its own clock) and
  // reload the profile — needsRaceSelection then sends the player below.
  useEffect(() => {
    if (!profile?.seasonResetAt) return;
    const delayMs = Math.max(0, new Date(profile.seasonResetAt).getTime() - Date.now()) + 1000;
    const timeout = setTimeout(() => {
      checkSeason()
        .catch(() => undefined)
        .finally(loadProfile);
    }, delayMs);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.seasonResetAt]);

  // New season: the race picker lives on the Command Center — any other page sends the player there.
  useEffect(() => {
    if (profile?.needsRaceSelection && pathname !== '/dashboard') {
      router.replace('/dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.needsRaceSelection, pathname]);

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
      <TopBar profile={profile} loggedIn={loggedIn} supportUnread={!!notifications?.support} />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <Sidebar hasUnreadFriends={hasUnreadFriends} hasDailyTaskReward={!!notifications?.dailyTasks || !!notifications?.achievements} />
        <main className="w-full max-w-[1500px] flex-1 px-4 pb-20 pt-4 md:p-7">
          {/* Pending account deletion (owner decision, 2026-10-12): shown on every page until it happens or is cancelled. */}
          {profile?.deletionScheduledFor && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-panelBorderDanger bg-panel px-4 py-3 text-xs">
              <span className="text-danger">{t('accountDeletion.bannerScheduled', { date: formatDateTime(profile.deletionScheduledFor) })}</span>
              <button
                type="button"
                onClick={() => cancelAccountDeletion().then(loadProfile).catch(() => undefined)}
                className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-[11px] uppercase hover:bg-accentBgHover"
              >
                {t('accountDeletion.cancel')}
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
      {loggedIn && <NotificationCenter notifications={notifications} profile={profile} />}
      {loggedIn && <BottomNav hasUnreadFriends={hasUnreadFriends} hasDailyTaskReward={!!notifications?.dailyTasks || !!notifications?.achievements} />}
      {/* After a season reset everyone re-picks their race before playing on (owner decision, 2026-10-13). */}
      {profile?.needsRaceSelection && pathname === '/dashboard' && <RaceSelectModal seasonNumber={profile.seasonNumber} onChosen={loadProfile} />}
    </div>
  );
}
