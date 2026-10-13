'use client';

import type { ReactNode } from 'react';

// A small modal anchored to the bottom of the screen on mobile (centered on
// larger screens) — used instead of a dropdown anchored to a trigger button,
// since a dropdown risks being clipped by a horizontally-scrolling ancestor
// (e.g. the clan roster table on narrow screens).
// `wide` gives longer lists (daily tasks, achievements) more room and scrolls them inside.
export function BottomSheet({ open, onClose, children, wide = false }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`w-full rounded-t-lg border border-panelBorder bg-panel p-5 sm:rounded-lg ${wide ? 'max-h-[85vh] max-w-lg overflow-y-auto' : 'max-w-sm'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
