'use client';

import { useTranslations } from 'next-intl';

/** Prev / "page X of Y" / next — renders nothing when everything fits on one page. */
export function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  const t = useTranslations();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-panelBorder px-4 py-3 text-xs text-textMuted">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="rounded border border-wellBorder bg-well px-3 py-1.5 disabled:opacity-40"
      >
        {t('leaderboard.pagePrev')}
      </button>
      <span>{t('leaderboard.pageInfo', { page, total: totalPages })}</span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded border border-wellBorder bg-well px-3 py-1.5 disabled:opacity-40"
      >
        {t('leaderboard.pageNext')}
      </button>
    </div>
  );
}
