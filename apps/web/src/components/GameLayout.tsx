'use client';

import type { PlayerProfileDto } from '@pentilius/shared';
import { useEffect, useState } from 'react';
import { getProfile } from '@/lib/api-client';
import { clearTokens, isAuthenticated } from '@/lib/auth';
import { onProfileChanged } from '@/lib/profile-events';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';

export function GameLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState<PlayerProfileDto | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  function loadProfile() {
    getProfile()
      .then((data) => {
        setProfile(data);
        setLoggedIn(true);
      })
      .catch(() => {
        // Stored token is missing/expired — treat as logged out rather than showing dead chrome.
        clearTokens();
        setLoggedIn(false);
      });
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      setLoggedIn(false);
      return;
    }
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any page that spends energy (PvE/PvP attacks, etc.) fetches its own copy
  // of the profile for its own display — this keeps the top StatusBar's
  // energy bar in sync with those actions without lifting state into a
  // shared context.
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

  return (
    <div className="min-h-screen bg-ink text-text">
      <TopBar profile={profile} loggedIn={loggedIn} onMenuClick={() => setMenuOpen((open) => !open)} />
      {loggedIn && profile && <StatusBar profile={profile} />}
      <div className="flex min-h-[calc(100vh-4rem)]">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="w-full max-w-[1500px] flex-1 p-4 md:p-7">{children}</main>
      </div>
    </div>
  );
}
