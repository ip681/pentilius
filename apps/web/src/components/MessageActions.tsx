'use client';

import type { ReportTargetType } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BottomSheet } from '@/components/BottomSheet';
import { ReportSheet } from '@/components/ReportSheet';
import { blockPlayer } from '@/lib/api-client';

/**
 * The small "⋯" next to someone else's chat message (owner decision,
 * 2026-10-12): report that message, and optionally block its author.
 * Used by clan chat (report + block) and direct messages (report only — a DM
 * partner is blocked from their profile, which also ends the friendship).
 */
export function MessageActions({
  messageId,
  targetType,
  authorId,
  authorName,
  allowBlock,
  onBlocked,
}: {
  messageId: string;
  targetType: Extract<ReportTargetType, 'CLAN_MESSAGE' | 'DIRECT_MESSAGE'>;
  authorId: string;
  authorName: string;
  allowBlock: boolean;
  onBlocked?: () => void;
}) {
  const t = useTranslations();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function closeMenu() {
    setMenuOpen(false);
    setConfirmingBlock(false);
    setError(null);
  }

  async function handleBlock() {
    try {
      await blockPlayer(authorId);
      closeMenu();
      onBlocked?.();
    } catch {
      setError(t('moderation.blockError'));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label={t('moderation.messageActions')}
        title={t('moderation.messageActions')}
        className="ml-1 rounded px-1 text-textFaint opacity-60 hover:bg-accentBgHover hover:text-text hover:opacity-100"
      >
        ⋯
      </button>

      <BottomSheet open={menuOpen} onClose={closeMenu}>
        {confirmingBlock ? (
          <>
            <p className="mb-4 text-sm text-textMuted">{t('moderation.confirmBlockText', { name: authorName })}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBlock}
                className="flex-1 rounded-md border border-panelBorderDanger bg-well py-2.5 text-xs uppercase text-danger hover:bg-accentBgHover"
              >
                {t('moderation.block')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingBlock(false)}
                className="flex-1 rounded-md border border-panelBorder bg-panel py-2.5 text-xs uppercase text-textMuted hover:bg-accentBgHover"
              >
                {t('common.cancel')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="mb-3 text-sm font-semibold">{authorName}</h3>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  setReportOpen(true);
                }}
                className="rounded-md border border-wellBorder bg-well py-2.5 text-xs uppercase text-text hover:bg-accentBgHover"
              >
                {t('moderation.reportMessage')}
              </button>
              {allowBlock && (
                <button
                  type="button"
                  onClick={() => setConfirmingBlock(true)}
                  className="rounded-md border border-panelBorderDanger bg-well py-2.5 text-xs uppercase text-danger hover:bg-accentBgHover"
                >
                  {t('moderation.blockName', { name: authorName })}
                </button>
              )}
            </div>
            <button type="button" onClick={closeMenu} className="mt-3 w-full text-center text-xs text-textFaint underline">
              {t('common.close')}
            </button>
          </>
        )}
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      </BottomSheet>

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType={targetType}
        targetId={messageId}
        title={t('moderation.reportMessageTitle', { name: authorName })}
      />
    </>
  );
}
