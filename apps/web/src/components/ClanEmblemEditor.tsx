'use client';

import type { ClanDetailDto, ClanEmblemChoiceDto, ClanEmblemOptionsDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ApiError, getClanEmblemOptions, updateClanEmblem } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-datetime';
import { ClanEmblem } from './ClanEmblem';

// The leader's emblem editor (owner decision, 2026-10-21): shape, symbol and
// two palette colors, with a live preview. Free on the clan's first day, then
// once per cooldown — the server decides; this only shows it.
export function ClanEmblemEditor({ clan, onSaved, onCancel }: { clan: ClanDetailDto; onSaved: () => void; onCancel: () => void }) {
  const t = useTranslations();
  const [options, setOptions] = useState<ClanEmblemOptionsDto | null>(null);
  const [choice, setChoice] = useState<ClanEmblemChoiceDto>(clan.emblemChoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getClanEmblemOptions()
      .then(setOptions)
      .catch(() => setError(t('clans.emblem.error')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!options) {
    return <div className="mb-4 rounded-md border border-wellBorder bg-well p-4 text-xs text-textFaint">{error ?? '…'}</div>;
  }

  const hex = (key: string) => options.palette.find((c) => c.key === key)?.hex ?? '#888888';
  const preview = (shape: number, symbol: number) => ({
    shapeAssetId: options.shapes.find((s) => s.id === shape)!.assetId,
    symbolAssetId: options.symbols.find((s) => s.id === symbol)!.assetId,
    backgroundColor: hex(choice.backgroundColor),
    symbolColor: hex(choice.symbolColor),
    symbolScale: options.symbolScale,
  });
  const locked = clan.emblemChangeAvailableAt;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateClanEmblem(choice);
      onSaved();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      setError(
        code === 'EMBLEM_SAME_COLORS' ? t('clans.emblem.sameColors') : code === 'EMBLEM_COOLDOWN' ? t('clans.emblem.cooldownError') : t('clans.emblem.error'),
      );
    } finally {
      setBusy(false);
    }
  }

  const tile = (active: boolean) =>
    `flex aspect-square items-center justify-center rounded-md border p-1 ${active ? 'border-accent bg-accentBg' : 'border-wellBorder bg-ink hover:bg-accentBgHover'}`;

  const colorRow = (field: 'backgroundColor' | 'symbolColor', other: string) => (
    <div className="flex flex-wrap gap-1.5">
      {options.palette.map((c) => (
        <button
          key={c.key}
          type="button"
          disabled={c.key === other}
          onClick={() => setChoice({ ...choice, [field]: c.key })}
          aria-label={c.key}
          className={`h-8 w-8 rounded-full border-2 disabled:cursor-not-allowed disabled:opacity-20 ${choice[field] === c.key ? 'border-text' : 'border-wellBorder'}`}
          style={{ backgroundColor: c.hex }}
        />
      ))}
    </div>
  );

  return (
    <div className="mb-4 flex flex-col gap-4 rounded-md border border-wellBorder bg-well p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-textFaint">{t('clans.emblem.title')}</h3>

      <div className="flex items-center gap-4">
        <ClanEmblem emblem={preview(choice.shape, choice.symbol)} size={96} />
        <p className="text-[11px] text-textFaint">
          {locked ? t('clans.emblem.cooldown', { date: formatDateTime(locked) }) : t('clans.emblem.rules', { days: options.changeCooldownDays })}
        </p>
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-textMuted">
        {t('clans.emblem.shape')}
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
          {options.shapes.map((s) => (
            <button key={s.id} type="button" onClick={() => setChoice({ ...choice, shape: s.id })} className={tile(choice.shape === s.id)}>
              <ClanEmblem emblem={preview(s.id, choice.symbol)} size={36} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-textMuted">
        {t('clans.emblem.symbol')}
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
          {options.symbols.map((s) => (
            <button key={s.id} type="button" onClick={() => setChoice({ ...choice, symbol: s.id })} className={tile(choice.symbol === s.id)}>
              <ClanEmblem emblem={preview(choice.shape, s.id)} size={36} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-textMuted">
        {t('clans.emblem.shapeColor')}
        {colorRow('backgroundColor', choice.symbolColor)}
      </div>
      <div className="flex flex-col gap-1.5 text-xs text-textMuted">
        {t('clans.emblem.symbolColor')}
        {colorRow('symbolColor', choice.backgroundColor)}
      </div>

      {error && <p className="text-[11px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !!locked}
          onClick={save}
          className="rounded-md border border-accent bg-accentBg px-4 py-2 text-[11px] uppercase hover:bg-accentBgHover disabled:opacity-50"
        >
          {t('clans.editSave')}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-wellBorder bg-ink px-4 py-2 text-[11px] uppercase text-textMuted hover:bg-accentBgHover">
          {t('clans.editCancel')}
        </button>
      </div>
    </div>
  );
}
