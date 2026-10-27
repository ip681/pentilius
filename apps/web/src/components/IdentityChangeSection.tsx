'use client';

import type { IdentityChangeStatusDto, Race } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ApiError, changeName, changeRace, getIdentityChange } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-datetime';
import { formatNumber } from '@/lib/format-number';
import { notifyProfileChanged } from '@/lib/profile-events';
import { RACE_BG_CLASS } from '@/lib/race-colors';
import { AssetIcon } from './AssetIcon';
import { ResourceIcon } from './ResourceIcon';

const RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];

/**
 * Name and race change for Credits (owner decision, 2026-10-27). Both ask
 * for confirmation; the race change warns that items locked to another race
 * come off (they stay in the inventory). Nobody else is told about a change.
 */
export function IdentityChangeSection() {
  const t = useTranslations();
  const [status, setStatus] = useState<IdentityChangeStatusDto | null>(null);
  const [name, setName] = useState('');
  const [race, setRace] = useState<Race | ''>('');
  const [confirming, setConfirming] = useState<'name' | 'race' | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getIdentityChange()
      .then(setStatus)
      .catch(() => setError(t('settings.identity.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function errorText(err: unknown, kind: 'name' | 'race'): string {
    if (err instanceof ApiError) {
      if (err.code === 'NOT_ENOUGH_CREDITS') return t('settings.identity.errors.credits');
      if (err.code === 'CHANGE_COOLDOWN') return t('settings.identity.errors.cooldown');
      if (err.code === 'USERNAME_TAKEN' || err.code === 'USERNAME_RESERVED') return t('settings.identity.errors.taken');
      if (err.code === 'INAPPROPRIATE_CONTENT') return t('common.inappropriateContent');
      if (err.code === 'SAME_NAME') return t('settings.identity.errors.sameName');
      if (err.code === 'SAME_RACE') return t('settings.identity.errors.sameRace');
      if (kind === 'name' && err.status === 400) return t('settings.identity.errors.format');
    }
    return t('settings.identity.errors.generic');
  }

  async function submit(kind: 'name' | 'race') {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (kind === 'name') {
        const next = await changeName(name.trim());
        setStatus(next);
        setName('');
        setMessage(t('settings.identity.nameDone', { name: next.username }));
      } else if (race) {
        const next = await changeRace(race);
        setStatus(next);
        setRace('');
        setMessage(next.unequipped ? t('settings.identity.raceDoneUnequipped', { count: next.unequipped }) : t('settings.identity.raceDone'));
      }
      notifyProfileChanged();
    } catch (err) {
      setError(errorText(err, kind));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  if (!status) {
    return (
      <section>
        <h2 className="mb-3 text-sm font-semibold">{t('settings.identity.title')}</h2>
        <p className="text-xs text-textMuted">{error ?? '…'}</p>
      </section>
    );
  }

  const price = (amount: number) => (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {formatNumber(amount)}
      <ResourceIcon type="CREDITS" className="h-3.5 w-3.5" />
    </span>
  );
  const nameValid = /^[a-zA-Z0-9_]{3,20}$/.test(name.trim());
  const button = 'rounded-md border border-accent bg-accentBg px-3 py-1.5 text-[11px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-40';
  const raceBadge = (r: Race, size: string) => (
    <span className="flex items-center gap-1.5">
      <AssetIcon assetId={`races.${r.toLowerCase()}.icon`} alt={t(`race.${r}.name`)} className={`${size} object-contain`} fallback={null} />
      {t(`race.${r}.name`)}
    </span>
  );
  const confirmBox = (kind: 'name' | 'race', text: string) => (
    <div className="mt-2 rounded-md border border-vipGold px-3 py-2 text-xs">
      {/* Old → new race with their icons, so the wrong one isn't picked by mistake (owner decision, 2026-10-27). */}
      {kind === 'race' && race && (
        <div className="mb-2 flex flex-wrap items-center justify-center gap-3 text-sm font-semibold">
          {raceBadge(status.race, 'h-7 w-7')}
          <span className="text-textMuted">→</span>
          {raceBadge(race, 'h-7 w-7')}
        </div>
      )}
      <p className="mb-2">{text}</p>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => submit(kind)} className={button}>
          {t('settings.identity.confirmYes')}
        </button>
        <button type="button" disabled={busy} onClick={() => setConfirming(null)} className="rounded-md border border-panelBorder px-3 py-1.5 text-[11px] uppercase text-textMuted hover:bg-accentBgHover">
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold">{t('settings.identity.title')}</h2>
      <p className="mb-4 flex items-center gap-1 text-xs text-textMuted">
        {t('settings.identity.balance')} {price(status.credits)}
      </p>

      {/* Name */}
      <div className="mb-5">
        <h3 className="mb-1 text-xs font-semibold">{t('settings.identity.nameTitle')}</h3>
        <p className="mb-2 text-[11px] text-textMuted">
          {t('settings.identity.current')}: <span className="text-text">{status.username}</span> · {t('settings.identity.price')} {price(status.nameCredits)}
        </p>
        {status.nameAvailableAt ? (
          <p className="text-[11px] text-textFaint">{t('settings.identity.nextChange', { date: formatDateTime(status.nameAvailableAt) })}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={name}
                maxLength={20}
                onChange={(e) => {
                  setName(e.target.value);
                  setConfirming(null);
                }}
                placeholder={t('settings.identity.namePlaceholder')}
                className="min-w-0 flex-1 rounded-md border border-wellBorder bg-ink px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
              <button type="button" disabled={busy || !nameValid || name.trim() === status.username} onClick={() => setConfirming('name')} className={button}>
                {t('settings.identity.nameButton')}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-textFaint">{t('settings.identity.nameRules')}</p>
            {confirming === 'name' && confirmBox('name', t('settings.identity.nameConfirm', { name: name.trim(), price: status.nameCredits }))}
          </>
        )}
      </div>

      {/* Race */}
      <div>
        <h3 className="mb-1 text-xs font-semibold">{t('settings.identity.raceTitle')}</h3>
        <p className="mb-2 text-[11px] text-textMuted">
          {t('settings.identity.current')}: <span className="text-text">{t(`race.${status.race}.name`)}</span> · {t('settings.identity.price')}{' '}
          {price(status.raceCredits)}
        </p>
        {status.raceAvailableAt ? (
          <p className="text-[11px] text-textFaint">{t('settings.identity.nextChange', { date: formatDateTime(status.raceAvailableAt) })}</p>
        ) : (
          <>
            {/* The other four races as tiles with their icons (owner decision, 2026-10-27). */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RACES.filter((r) => r !== status.race).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRace(r);
                    setConfirming(null);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs ${RACE_BG_CLASS[r]} ${race === r ? 'border-accent' : 'border-wellBorder hover:border-accent'}`}
                >
                  <AssetIcon assetId={`races.${r.toLowerCase()}.icon`} alt={t(`race.${r}.name`)} className="h-9 w-9 object-contain" fallback={null} />
                  {t(`race.${r}.name`)}
                </button>
              ))}
            </div>
            <button type="button" disabled={busy || !race} onClick={() => setConfirming('race')} className={`mt-2 ${button}`}>
              {t('settings.identity.raceButton')}
            </button>
            <p className="mt-2 text-[11px] text-vipGold">{t('settings.identity.raceWarning')}</p>
            {confirming === 'race' && race && confirmBox('race', t('settings.identity.raceConfirm', { race: t(`race.${race}.name`), price: status.raceCredits }))}
          </>
        )}
      </div>

      {message && <p className="mt-4 text-xs text-positive">{message}</p>}
      {error && <p className="mt-4 text-xs text-danger">{error}</p>}
    </section>
  );
}
