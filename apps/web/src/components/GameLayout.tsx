'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function GameLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ink text-text">
      <TopBar onMenuClick={() => setMenuOpen((open) => !open)} />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="w-full max-w-[1500px] flex-1 p-4 md:p-7">{children}</main>
      </div>
    </div>
  );
}
