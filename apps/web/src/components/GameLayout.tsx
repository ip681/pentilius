'use client';

import type { PlayerProfileDto } from '@pentilius/shared';
import { useEffect, useState } from 'react';
import { getProfile } from '@/lib/api-client';
import { clearTokens, isAuthenticated } from '@/lib/auth';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';

export function GameLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState<PlayerProfileDto | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      setLoggedIn(false);
      return;
    }
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
  }, []);

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
