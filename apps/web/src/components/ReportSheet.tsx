'use client';

import type { ReportReason, ReportTargetType } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/BottomSheet';
import { ApiError, createReport } from '@/lib/api-client';

const REASONS: ReportReason[] = ['HARASSMENT', 'OFFENSIVE_CONTENT', 'SPAM', 'CHEATING', 'OTHER'];
const MAX_COMMENT_LENGTH = 300;

/**
 * Report a player, clan or message (owner decision, 2026-10-12 — app-store UGC
 * requirement). The client only says WHAT is reported; the server captures the
 * content itself and enforces all abuse limits. Shared by the profile page,
 * the public clan page, clan chat and direct messages.
 */
export function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  title: string;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh form every time the sheet opens for a (possibly different) target.
  useEffect(() => {
    if (open) {
      setReason(null);
      setComment('');
      setSent(false);
      setError(null);
    }
  }, [open, targetId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) return;
    setSending(true);
    setError(null);
    try {
      await createReport({ targetType, targetId, reason, comment: comment.trim() || undefined });
      setSent(true);
    } catch (err) {
      const map: Record<string, string> = {
        REPORTING_SUSPENDED: t('moderation.errorSuspended'),
        REPORTING_NOT_YET_ALLOWED: t('moderation.errorNotYetAllowed'),
        REPORTING_TOO_FAST: t('moderation.errorTooFast'),
        REPORT_DAILY_LIMIT: t('moderation.errorDailyLimit'),
        ALREADY_REPORTED: t('moderation.errorAlreadyReported'),
      };
      setError(err instanceof ApiError && err.code && map[err.code] ? map[err.code] : t('moderation.reportError'));
    } finally {
      setSending(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {sent ? (
        <>
          <p className="text-xs text-positive">{t('moderation.reportSent')}</p>
          <button type="button" onClick={onClose} className="mt-4 w-full text-center text-xs text-textFaint underline">
            {t('common.close')}
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <p className="mb-2 text-[11px] text-textMuted">{t('moderation.chooseReason')}</p>
          <div className="mb-3 flex flex-col gap-1.5">
            {REASONS.map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs ${reason === r ? 'border-accent bg-accentBg' : 'border-wellBorder bg-well'}`}
              >
                <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-current" />
                {t(`moderation.reasons.${r}`)}
              </label>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
            placeholder={t('moderation.commentPlaceholder')}
            rows={3}
            className="mb-1 w-full resize-none rounded-md border border-wellBorder bg-well px-3 py-2 text-xs outline-none focus:border-accent"
          />
          <p className="mb-3 text-right text-[10px] text-textFaint">
            {comment.length}/{MAX_COMMENT_LENGTH}
          </p>
          {error && <p className="mb-3 text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!reason || sending}
              className="flex-1 rounded-md border border-panelBorderDanger bg-well py-2.5 text-xs uppercase text-danger hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('moderation.sendReport')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-panelBorder bg-panel py-2.5 text-xs uppercase text-textMuted hover:bg-accentBgHover"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}
    </BottomSheet>
  );
}
