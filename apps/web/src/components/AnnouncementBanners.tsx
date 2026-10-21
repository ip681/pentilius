'use client';

import type { AnnouncementDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { dismissAnnouncement } from '@/lib/api-client';

// Staff announcements (owner decision, 2026-10-21): at the top of every page,
// newest first. Both kinds close with ×; closing is saved on the server, so it
// stays closed on every device. Plain text only.
export function AnnouncementBanners({ announcements }: { announcements: AnnouncementDto[] }) {
  const t = useTranslations();
  const [closed, setClosed] = useState<string[]>([]);
  const visible = announcements.filter((a) => !closed.includes(a.id));
  if (visible.length === 0) return null;

  function close(id: string) {
    setClosed((ids) => [...ids, id]);
    // If saving fails, it simply shows again on the next page — nothing to tell the player.
    dismissAnnouncement(id).catch(() => undefined);
  }

  return (
    <div className="mb-4 flex flex-col gap-2">
      {visible.map((a) => {
        const important = a.kind === 'IMPORTANT';
        return (
          <div
            key={a.id}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-xs ${
              important ? 'border-gold bg-gold/10' : 'border-panelBorder bg-panel'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className={`mb-1 text-[9px] font-semibold uppercase tracking-wide ${important ? 'text-gold' : 'text-textFaint'}`}>
                {t(important ? 'announcements.important' : 'announcements.info')}
              </div>
              <p className="whitespace-pre-line break-words leading-relaxed">{a.text}</p>
            </div>
            <button
              type="button"
              onClick={() => close(a.id)}
              aria-label={t('common.close')}
              className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-textFaint hover:bg-accentBgHover hover:text-text"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
