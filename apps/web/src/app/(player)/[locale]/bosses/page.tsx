'use client';

import type { BossDto, BossFormationDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { BossFormationCard } from '@/components/BossFormationCard';
import { ConfirmButton } from '@/components/ConfirmButton';
import { GameLayout } from '@/components/GameLayout';
import {
  ApiError,
  createBossFormation,
  getBossFormations,
  getMyClan,
  joinBossFormation,
  updateBossFormationVisibility,
} from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { getCachedProfile } from '@/lib/profile-cache';
import { useRefresh } from '@/lib/use-refresh';
import { useRequireAuth } from '@/lib/use-require-auth';
import { formatNumber } from '@/lib/format-number';

export default function BossesPage() {
  useRequireAuth();
  const t = useTranslations();
  const [data, setData] = useState<{ bosses: BossDto[]; nextActionAvailableAt: string | null } | null>(null);
  const [inClan, setInClan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [visibilityDraft, setVisibilityDraft] = useState<Record<string, { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean }>>({});

  const myRace = getCachedProfile()?.race ?? null;

  async function load() {
    try {
      const [formations, myClan] = await Promise.all([getBossFormations(), getMyClan()]);
      setData(formations);
      setInClan(myClan.clan !== null);
    } catch {
      setError(t('bosses.loadError'));
    }
  }

  // Other players fill formations — live, but only while the tab is visible.
  useRefresh(load, { intervalMs: 10_000 });

  // Live countdown for OPEN formations and the viewer's own cooldown — ticks only while something is worth ticking for.
  const hasCountdown = Boolean(data?.nextActionAvailableAt) || Boolean(data?.bosses.some((b) => b.formations.some((f) => f.status === 'OPEN')));
  useEffect(() => {
    if (!hasCountdown) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasCountdown]);

  function draftFor(bossKey: string) {
    return visibilityDraft[bossKey] ?? { visibleToClanOnly: false, visibleToFriendsOnly: false };
  }

  function setDraft(bossKey: string, next: { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean }) {
    setVisibilityDraft((prev) => ({ ...prev, [bossKey]: next }));
  }

  function errorMessage(err: unknown, bossMinLevel = 0): string {
    if (err instanceof ApiError && err.code) {
      const map: Record<string, string> = {
        LEVEL_TOO_LOW: t('bosses.errorLevelTooLow', { level: bossMinLevel }),
        NOT_IN_CLAN: t('bosses.errorNotInClan'),
        BOSS_FORMATION_COOLDOWN_ACTIVE: t('bosses.errorCooldownActive'),
        EXPEDITION_IN_PROGRESS: t('bosses.expeditionInProgress'),
        SLOT_ALREADY_FILLED: t('bosses.errorSlotFilled'),
        FORMATION_ALREADY_RESOLVED: t('bosses.errorAlreadyResolved'),
        VISIBILITY_EDIT_WINDOW_CLOSED: t('bosses.errorVisibilityLocked'),
      };
      if (map[err.code]) return map[err.code];
    }
    return t('bosses.actionError');
  }

  async function handleCreate(bossKey: string) {
    setError(null);
    try {
      await createBossFormation(bossKey, draftFor(bossKey));
      await load();
    } catch (err) {
      setError(errorMessage(err, data?.bosses.find((b) => b.key === bossKey)?.minLevel ?? 0));
    }
  }

  async function handleJoin(formationId: string) {
    setError(null);
    try {
      await joinBossFormation(formationId);
      await load();
    } catch (err) {
      const bossMinLevel = data?.bosses.find((b) => b.formations.some((f) => f.id === formationId))?.minLevel ?? 0;
      setError(errorMessage(err, bossMinLevel));
    }
  }

  async function handleVisibilityToggle(formation: BossFormationDto, next: { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean }) {
    setError(null);
    try {
      await updateBossFormationVisibility(formation.id, next);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const cooldownRemainingMs = data?.nextActionAvailableAt ? new Date(data.nextActionAvailableAt).getTime() - now : 0;
  const onCooldown = cooldownRemainingMs > 0;

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('bosses.title')}</h1>
        <p className="text-xs text-textMuted">{t('bosses.subtitle')}</p>
        {onCooldown && (
          <p className="mt-2 text-xs text-gold">
            {t('bosses.cooldownActive')} <span className="tabular-nums">{formatDuration(cooldownRemainingMs / 1000)}</span>
          </p>
        )}
      </div>

      {error && <p className="mb-4 text-danger">{error}</p>}

      {data && (
        <div className="flex flex-col gap-6">
          {data.bosses.map((boss) => (
            <section key={boss.id} className="overflow-hidden rounded-lg border border-panelBorder bg-panel">
              <div className="flex items-center justify-between border-b border-panelBorder bg-panelHeader px-4 py-3">
                <span className="text-sm font-semibold">{t(boss.nameKey)}</span>
                <span className="text-[10px] uppercase text-textFaint">{t(boss.zoneNameKey)}</span>
              </div>

              <div className="p-5">
                {!boss.unlocked && <p className="mb-3 text-xs text-textMuted">{t('bosses.locked', { level: boss.minLevel })}</p>}

                {/* Visible but inactive below the required level — shown greyed out/desaturated
                    and non-interactive rather than hidden, same treatment as a locked zone wedge. */}
                <div className={boss.unlocked ? undefined : 'pointer-events-none opacity-40 grayscale'}>
                  <p className="mb-4 text-xs text-textMuted">
                    HP {formatNumber(boss.maxHp)} · {t('bosses.attack')} {formatNumber(boss.attack)} · {t('bosses.defense')} {formatNumber(boss.defense)} · {t('bosses.xpReward')} {formatNumber(boss.xpReward)}
                  </p>

                  <div className="mb-5 rounded border border-wellBorder bg-well p-3">
                    <p className="mb-2 text-xs font-semibold">{t('bosses.createFormation')}</p>
                    <div className="mb-3 flex flex-col gap-1.5">
                      <label className={`flex items-center gap-2 text-xs ${inClan ? 'text-textMuted' : 'cursor-not-allowed text-textFaint opacity-50'}`}>
                        <input
                          type="checkbox"
                          checked={draftFor(boss.key).visibleToClanOnly}
                          disabled={!inClan}
                          onChange={(e) => setDraft(boss.key, { ...draftFor(boss.key), visibleToClanOnly: e.target.checked })}
                          className="accent-accent"
                        />
                        {t('market.clanOnly')}
                      </label>
                      <label className="flex items-center gap-2 text-xs text-textMuted">
                        <input
                          type="checkbox"
                          checked={draftFor(boss.key).visibleToFriendsOnly}
                          onChange={(e) => setDraft(boss.key, { ...draftFor(boss.key), visibleToFriendsOnly: e.target.checked })}
                          className="accent-accent"
                        />
                        {t('market.friendsOnly')}
                      </label>
                    </div>
                    <ConfirmButton
                      label={t('bosses.createFormation')}
                      confirmLabel={t('common.confirm')}
                      cancelLabel={t('common.cancel')}
                      message={t('bosses.createConfirm')}
                      onConfirm={() => handleCreate(boss.key)}
                      disabled={onCooldown || !boss.unlocked}
                      className="rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase text-text hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                      confirmClassName="flex-1 rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase text-text hover:bg-accentBgHover"
                      cancelClassName="flex-1 rounded-md border border-panelBorder bg-panel px-4 py-2 text-xs uppercase text-textMuted hover:bg-accentBgHover"
                    />
                  </div>

                  {boss.formations.length === 0 ? (
                    <p className="text-xs text-textFaint">{t('bosses.noFormations')}</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {boss.formations.map((formation) => (
                        <BossFormationCard
                          key={formation.id}
                          formation={formation}
                          now={now}
                          myRace={myRace}
                          onCooldown={onCooldown}
                          onJoin={() => handleJoin(formation.id)}
                          onVisibilityToggle={(next) => handleVisibilityToggle(formation, next)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </GameLayout>
  );
}
