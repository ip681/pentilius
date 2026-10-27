'use client';

import type { BossDto, BossFormationDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from './AssetIcon';
import { BossBattleReport } from './BossBattleReport';
import { BossFormationCard } from './BossFormationCard';
import { ConfirmButton } from './ConfirmButton';
import { DropEntry } from './DropEntry';
import { ApiError, createBossFormation, getBossFormation, getBossFormations, getMyClan, joinBossFormation, updateBossFormationVisibility } from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { formatNumber } from '@/lib/format-number';
import { getCachedProfile } from '@/lib/profile-cache';
import { useRefresh } from '@/lib/use-refresh';

/**
 * A zone's boss with its open formations (owner decision, 2026-10-11; on its
 * own page since 2026-10-21, /zones/{zoneId}/boss). Self-contained: own
 * fetch, live refresh and countdown. Only OPEN formations are shown — a
 * finished fight's result is in the battle reports, so this never grows into
 * a history list.
 */
export function ZoneBossPanel({ zoneId, battleId }: { zoneId: string; battleId?: string | null }) {
  const t = useTranslations();
  const [data, setData] = useState<{ bosses: BossDto[]; nextActionAvailableAt: string | null } | null>(null);
  const [inClan, setInClan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [visibility, setVisibility] = useState({ visibleToClanOnly: false, visibleToFriendsOnly: false });

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

  const boss = data?.bosses.find((b) => b.zoneId === zoneId) ?? null;
  const openFormations = boss?.formations.filter((f) => f.status === 'OPEN') ?? [];
  // The player's own finished fights of the last day (the server only sends those).
  const recentBattles = boss?.formations.filter((f) => f.status === 'RESOLVED' && f.slots.some((s) => s.isCurrentPlayer) && f.result) ?? [];
  // A battle opened by link (Command Center, battle reports) that's older than the recent list.
  const [linkedBattle, setLinkedBattle] = useState<BossFormationDto | null>(null);
  const [justFought, setJustFought] = useState<string | null>(null);
  useEffect(() => {
    if (!battleId || !boss || recentBattles.some((f) => f.id === battleId)) return;
    getBossFormation(battleId)
      .then((f) => setLinkedBattle(f.result ? f : null))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId, boss?.id]);
  const shownBattles = linkedBattle && !recentBattles.some((f) => f.id === linkedBattle.id) ? [linkedBattle, ...recentBattles] : recentBattles;

  const hasCountdown = Boolean(data?.nextActionAvailableAt) || openFormations.length > 0;
  useEffect(() => {
    if (!hasCountdown) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasCountdown]);

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError && err.code) {
      const map: Record<string, string> = {
        LEVEL_TOO_LOW: t('bosses.errorLevelTooLow', { level: boss?.minLevel ?? 0 }),
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

  async function handleCreate() {
    if (!boss) return;
    setError(null);
    try {
      await createBossFormation(boss.key, visibility);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleJoin(formationId: string) {
    setError(null);
    try {
      const joined = await joinBossFormation(formationId);
      // The fifth fighter starts the fight at once — play it for them.
      if (joined.status === 'RESOLVED') setJustFought(joined.id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleVisibilityToggle(formationId: string, next: { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean }) {
    setError(null);
    try {
      await updateBossFormationVisibility(formationId, next);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!boss) return null;

  const cooldownRemainingMs = data?.nextActionAvailableAt ? new Date(data.nextActionAvailableAt).getTime() - now : 0;
  const onCooldown = cooldownRemainingMs > 0;

  return (
    <section className="overflow-hidden rounded-lg border border-gold/50 bg-panel">
      <div className="flex items-center justify-between border-b border-gold/50 bg-panelHeader px-4 py-3">
        <span className="text-sm font-semibold uppercase text-gold">
          {t('bosses.title')}: {t(boss.nameKey)}
        </span>
        {onCooldown && (
          <span className="text-[10px] tabular-nums text-gold">
            {t('bosses.cooldownActive')} {formatDuration(cooldownRemainingMs / 1000)}
          </span>
        )}
      </div>

      <div className="p-5">
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}

        {!boss.unlocked && <p className="mb-3 text-xs text-textMuted">{t('bosses.locked', { level: boss.minLevel })}</p>}

        {/* Visible but inactive below the required level — shown greyed out/desaturated
            and non-interactive rather than hidden, same treatment as a locked zone wedge. */}
        <div className={boss.unlocked ? undefined : 'pointer-events-none opacity-40 grayscale'}>
          <div className="mb-4 flex items-center gap-5">
            <AssetIcon
              assetId={boss.iconAssetId}
              alt={t(boss.nameKey)}
              className="h-28 w-28 shrink-0 object-contain"
              fallback={<span className="flex h-28 w-28 shrink-0 items-center justify-center text-lg font-semibold text-textMuted">{t(boss.nameKey).charAt(0)}</span>}
            />
            <div className="flex flex-col gap-1">
              <div className="flex flex-col gap-1 text-xs text-textMuted">
                <span>HP {formatNumber(boss.maxHp)}</span>
                <span>
                  {t('bosses.attack')} {formatNumber(boss.attack)}
                </span>
                <span>
                  {t('bosses.defense')} {formatNumber(boss.defense)}
                </span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-textFaint">
                <span>{t('pve.drops')}:</span>
                <span className="inline-flex items-center gap-1">
                  {t('pve.xpGained')} +{formatNumber(boss.xpReward)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <AssetIcon
                    assetId={boss.guaranteedBoxIconAssetId}
                    alt={t(boss.guaranteedBoxNameKey)}
                    className="h-3.5 w-3.5 object-contain"
                    fallback={<span className="text-[8px] font-semibold text-textMuted">{t(boss.guaranteedBoxNameKey).charAt(0)}</span>}
                  />
                  {t(boss.guaranteedBoxNameKey)} ({t('bosses.guaranteed')})
                </span>
                {boss.lootDrops.map((drop, index) => (
                  <DropEntry key={index} drop={drop} />
                ))}
              </p>
            </div>
          </div>

          <div className="mb-5 rounded border border-wellBorder bg-well p-3">
            <p className="mb-2 text-xs font-semibold">{t('bosses.createFormation')}</p>
            <div className="mb-3 flex flex-col gap-1.5">
              <label className={`flex items-center gap-2 text-xs ${inClan ? 'text-textMuted' : 'cursor-not-allowed text-textFaint opacity-50'}`}>
                <input
                  type="checkbox"
                  checked={visibility.visibleToClanOnly}
                  disabled={!inClan}
                  onChange={(e) => setVisibility({ ...visibility, visibleToClanOnly: e.target.checked })}
                  className="accent-accent"
                />
                {t('market.clanOnly')}
              </label>
              <label className="flex items-center gap-2 text-xs text-textMuted">
                <input
                  type="checkbox"
                  checked={visibility.visibleToFriendsOnly}
                  onChange={(e) => setVisibility({ ...visibility, visibleToFriendsOnly: e.target.checked })}
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
              onConfirm={handleCreate}
              disabled={onCooldown || !boss.unlocked}
              className="rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase text-text hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
              confirmClassName="flex-1 rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase text-text hover:bg-accentBgHover"
              cancelClassName="flex-1 rounded-md border border-panelBorder bg-panel px-4 py-2 text-xs uppercase text-textMuted hover:bg-accentBgHover"
            />
          </div>

          {openFormations.length === 0 ? (
            <p className="text-xs text-textFaint">{t('bosses.noFormations')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {openFormations.map((formation) => (
                <BossFormationCard
                  key={formation.id}
                  formation={formation}
                  now={now}
                  myRace={myRace}
                  onCooldown={onCooldown}
                  onJoin={() => handleJoin(formation.id)}
                  onVisibilityToggle={(next) => handleVisibilityToggle(formation.id, next)}
                />
              ))}
            </div>
          )}

          {/* The player's own finished fights (owner decision, 2026-10-23). */}
          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-textFaint">{t('bosses.recentBattles')}</h3>
          {shownBattles.length === 0 ? (
            <p className="text-xs text-textFaint">{t('bosses.noRecentBattles')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {shownBattles.map((formation) => (
                <BossBattleReport key={formation.id} formation={formation} boss={boss} autoPlay={formation.id === battleId || formation.id === justFought} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
