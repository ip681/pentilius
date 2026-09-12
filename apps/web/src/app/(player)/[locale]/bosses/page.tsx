'use client';

import type { BossDto, BossFormationDto, Race } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { ConfirmButton } from '@/components/ConfirmButton';
import { GameLayout } from '@/components/GameLayout';
import { LootEntry } from '@/components/LootEntry';
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
import { RACE_BG_CLASS } from '@/lib/race-colors';
import { useRequireAuth } from '@/lib/use-require-auth';

const ALL_RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];

export default function BossesPage() {
  useRequireAuth();
  const t = useTranslations();
  const [data, setData] = useState<{ bosses: BossDto[]; minLevel: number; nextActionAvailableAt: string | null } | null>(null);
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

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError && err.code) {
      const map: Record<string, string> = {
        LEVEL_TOO_LOW: t('bosses.errorLevelTooLow', { level: data?.minLevel ?? 0 }),
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
      setError(errorMessage(err));
    }
  }

  async function handleJoin(formationId: string) {
    setError(null);
    try {
      await joinBossFormation(formationId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
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
                {!boss.unlocked ? (
                  <p className="text-xs text-textMuted">{t('bosses.locked', { level: data.minLevel })}</p>
                ) : (
                  <>
                    <p className="mb-4 text-xs text-textMuted">
                      HP {boss.maxHp} · {t('bosses.attack')} {boss.attack} · {t('bosses.defense')} {boss.defense} · {t('bosses.xpReward')} {boss.xpReward}
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
                        disabled={onCooldown}
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
                          <FormationCard
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
                  </>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </GameLayout>
  );
}

function FormationCard({
  formation,
  now,
  myRace,
  onCooldown,
  onJoin,
  onVisibilityToggle,
}: {
  formation: BossFormationDto;
  now: number;
  myRace: Race | null;
  onCooldown: boolean;
  onJoin: () => void;
  onVisibilityToggle: (next: { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean }) => void;
}) {
  const t = useTranslations();
  const isOpen = formation.status === 'OPEN';
  const remainingMs = isOpen ? new Date(formation.resolvesAt).getTime() - now : 0;

  const alreadyIn = formation.slots.some((s) => s.isCurrentPlayer);
  const mySlot = myRace ? formation.slots.find((s) => s.race === myRace) : undefined;
  const canJoin = isOpen && !alreadyIn && mySlot !== undefined && mySlot.playerId === null && !onCooldown;

  const mine = formation.slots.find((s) => s.isCurrentPlayer);

  return (
    <div className="rounded-lg border border-panelBorder bg-well p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-textMuted">
          {t('bosses.createdBy')} <span className="text-text">{formation.creatorUsername}</span>
        </span>
        {isOpen ? (
          <span className="tabular-nums text-gold">
            {t('bosses.joinWindow')} {formatDuration(remainingMs / 1000)}
          </span>
        ) : (
          <span className={`font-semibold uppercase ${formation.result?.outcome === 'WIN' ? 'text-positive' : formation.result?.outcome === 'LOSS' ? 'text-danger' : 'text-textFaint'}`}>
            {formation.result?.outcome === 'WIN' ? t('bosses.victory') : formation.result?.outcome === 'LOSS' ? t('bosses.defeat') : t('bosses.noOne')}
          </span>
        )}
      </div>

      {formation.canEditVisibility ? (
        <div className="mb-3 flex gap-3 text-[11px] text-textMuted">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={formation.visibleToClanOnly}
              onChange={(e) => onVisibilityToggle({ visibleToClanOnly: e.target.checked, visibleToFriendsOnly: formation.visibleToFriendsOnly })}
              className="accent-accent"
            />
            {t('market.clanOnly')}
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={formation.visibleToFriendsOnly}
              onChange={(e) => onVisibilityToggle({ visibleToClanOnly: formation.visibleToClanOnly, visibleToFriendsOnly: e.target.checked })}
              className="accent-accent"
            />
            {t('market.friendsOnly')}
          </label>
        </div>
      ) : (
        (formation.visibleToClanOnly || formation.visibleToFriendsOnly) && (
          <p className="mb-3 text-[11px] text-gold">
            {formation.visibleToClanOnly && formation.visibleToFriendsOnly
              ? t('market.visibilityClanAndFriends')
              : formation.visibleToClanOnly
                ? t('market.visibilityClanOnly')
                : t('market.visibilityFriendsOnly')}
          </p>
        )
      )}

      <div className="mb-3 grid grid-cols-5 gap-1.5">
        {ALL_RACES.map((race) => {
          const slot = formation.slots.find((s) => s.race === race);
          const filled = Boolean(slot?.playerId);
          return (
            <div
              key={race}
              className={`flex flex-col items-center gap-1 rounded-md border p-2 text-center ${filled ? RACE_BG_CLASS[race] + ' border-transparent' : 'border-dashed border-wellBorder opacity-50'}`}
            >
              <AssetIcon
                assetId={`races.${race.toLowerCase()}.icon`}
                alt={t(`race.${race}.name`)}
                className="h-6 w-6 object-contain"
                fallback={<span className="text-xs font-semibold">{t(`race.${race}.name`).charAt(0)}</span>}
              />
              <span className="w-full truncate text-[10px] text-text">{slot?.playerUsername ?? t('bosses.emptySlot')}</span>
            </div>
          );
        })}
      </div>

      {canJoin && (
        <ConfirmButton
          label={t('bosses.join')}
          confirmLabel={t('common.confirm')}
          cancelLabel={t('common.cancel')}
          message={t('bosses.joinConfirm')}
          onConfirm={onJoin}
          className="w-full rounded-md border border-accent bg-accentBg py-2 text-xs uppercase text-text hover:bg-accentBgHover"
          confirmClassName="flex-1 rounded-md border border-accent bg-accentBg py-2 text-xs uppercase text-text hover:bg-accentBgHover"
          cancelClassName="flex-1 rounded-md border border-panelBorder bg-panel py-2 text-xs uppercase text-textMuted hover:bg-accentBgHover"
        />
      )}

      {formation.result && mine && (
        <div className="mt-3 rounded border border-wellBorder bg-ink p-2.5 text-[11px]">
          <p className="text-textFaint">
            {t('bosses.totalDamage')}: <span className="text-text">{formation.result.totalDamageDealt}</span>
          </p>
          {formation.result.outcome === 'WIN' && mine.xpGained !== null && (
            <>
              <p className="mt-1 text-textFaint">
                +{mine.xpGained} {t('pve.xpGained')}
              </p>
              {mine.lootSummary && mine.lootSummary.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {mine.lootSummary.map((loot, index) => (
                    <li key={index}>
                      <LootEntry loot={loot} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
