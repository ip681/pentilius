'use client';

import type { ReactNode } from 'react';

// A small modal anchored to the bottom of the screen on mobile (centered on
// larger screens) — used instead of a dropdown anchored to a trigger button,
// since a dropdown risks being clipped by a horizontally-scrolling ancestor
// (e.g. the clan roster table on narrow screens).
export function BottomSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-lg border border-panelBorder bg-panel p-5 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
