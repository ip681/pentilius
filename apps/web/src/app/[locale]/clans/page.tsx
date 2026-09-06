'use client';

import type { ClanBuildingStateDto, ClanDetailDto, ClanSummaryDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ClanLink } from '@/components/ClanLink';
import { GameLayout } from '@/components/GameLayout';
import { PlayerLink } from '@/components/PlayerLink';
import {
  ApiError,
  createClan,
  demoteClanMember,
  disbandClan,
  donateToClan,
  getMyClan,
  joinClan,
  kickClanMember,
  leaveClan,
  listClans,
  promoteClanMember,
  transferClanLeadership,
  updateClan,
  upgradeClanBuilding,
} from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { useRequireAuth } from '@/lib/use-require-auth';

function buildingProgress(building: ClanBuildingStateDto): { active: boolean; percent: number; secondsLeft: number } {
  if (!building.constructionEndsAt || !building.nextLevelCost) {
    return { active: false, percent: 0, secondsLeft: 0 };
  }
  const endsAt = new Date(building.constructionEndsAt).getTime();
  const now = Date.now();
  if (endsAt <= now) {
    return { active: false, percent: 100, secondsLeft: 0 };
  }
  const totalSeconds = building.nextLevelCost.constructionSeconds;
  const secondsLeft = Math.ceil((endsAt - now) / 1000);
  const percent = Math.max(0, Math.min(100, ((totalSeconds - secondsLeft) / totalSeconds) * 100));
  return { active: true, percent, secondsLeft };
}

export default function ClansPage() {
  useRequireAuth();
  const t = useTranslations();
  const [myClan, setMyClan] = useState<ClanDetailDto | null | undefined>(undefined);
  const [clans, setClans] = useState<ClanSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [donateMetal, setDonateMetal] = useState('');
  const [donateCrystal, setDonateCrystal] = useState('');
  const [donateCredits, setDonateCredits] = useState('');
  const [editingClan, setEditingClan] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  async function load() {
    try {
      const [mine, list] = await Promise.all([getMyClan(), listClans()]);
      setMyClan(mine.clan);
      setClans(list);
    } catch {
      setError(t('clans.loadError'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function errorMessage(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
      const map: Record<string, string> = {
        ALREADY_IN_CLAN: t('clans.errorAlreadyInClan'),
        CLAN_NAME_TAKEN: t('clans.errorNameTaken'),
        CLAN_TAG_TAKEN: t('clans.errorTagTaken'),
        CLAN_FULL: t('clans.errorFull'),
        NOT_ENOUGH_RESOURCES: t('clans.errorNotEnoughResources'),
        NOT_ENOUGH_TREASURY: t('clans.errorNotEnoughTreasury'),
      };
      if (err.code && map[err.code]) return map[err.code];
    }
    return fallback;
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await createClan({ name, tag, description: description || undefined });
      await load();
    } catch (err) {
      setError(errorMessage(err, t('clans.createError')));
    }
  }

  async function handleJoin(clanId: string) {
    setError(null);
    try {
      await joinClan(clanId);
      await load();
    } catch (err) {
      setError(errorMessage(err, t('clans.joinError')));
    }
  }

  async function handleLeave() {
    if (!window.confirm(t('clans.confirmLeave'))) return;
    setError(null);
    try {
      await leaveClan();
      await load();
    } catch {
      setError(t('clans.actionError'));
    }
  }

  async function handleDisband() {
    if (!window.confirm(t('clans.confirmDisband'))) return;
    setError(null);
    try {
      await disbandClan();
      await load();
    } catch {
      setError(t('clans.actionError'));
    }
  }

  async function handleKick(playerId: string) {
    if (!window.confirm(t('clans.confirmKick'))) return;
    setError(null);
    try {
      await kickClanMember(playerId);
      await load();
    } catch {
      setError(t('clans.actionError'));
    }
  }

  async function handlePromote(playerId: string) {
    setError(null);
    try {
      await promoteClanMember(playerId);
      await load();
    } catch {
      setError(t('clans.actionError'));
    }
  }

  async function handleDemote(playerId: string) {
    setError(null);
    try {
      await demoteClanMember(playerId);
      await load();
    } catch {
      setError(t('clans.actionError'));
    }
  }

  async function handleTransfer(playerId: string) {
    if (!window.confirm(t('clans.confirmTransfer'))) return;
    setError(null);
    try {
      await transferClanLeadership(playerId);
      await load();
    } catch {
      setError(t('clans.actionError'));
    }
  }

  async function handleUpdateClan(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await updateClan({ name: editName, description: editDescription });
      setEditingClan(false);
      await load();
    } catch (err) {
      setError(errorMessage(err, t('clans.editError')));
    }
  }

  async function handleUpgradeBuilding(key: string) {
    setError(null);
    try {
      await upgradeClanBuilding(key);
      await load();
    } catch (err) {
      setError(errorMessage(err, t('clans.upgradeError')));
    }
  }

  async function handleDonate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await donateToClan({
        metal: donateMetal ? Number(donateMetal) : undefined,
        crystal: donateCrystal ? Number(donateCrystal) : undefined,
        credits: donateCredits ? Number(donateCredits) : undefined,
      });
      setDonateMetal('');
      setDonateCrystal('');
      setDonateCredits('');
      await load();
    } catch (err) {
      setError(errorMessage(err, t('clans.donateError')));
    }
  }

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('clans.title')}</h1>
        <p className="text-xs text-textMuted">{t('clans.subtitle')}</p>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {myClan === undefined && null}

      {myClan === null && (
        <>
          <section className="mb-6 rounded-lg border border-panelBorder bg-panel p-5">
            <h2 className="mb-3 text-sm font-semibold">{t('clans.createTitle')}</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-3 md:flex-row md:items-end">
              <label className="flex flex-1 flex-col gap-1.5 text-xs text-textMuted">
                {t('clans.name')}
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={30}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="flex w-full flex-col gap-1.5 text-xs text-textMuted md:w-28">
                {t('clans.tag')}
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={5}
                  pattern="[a-zA-Z0-9]+"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1.5 text-xs text-textMuted">
                {t('clans.description')}
                <input
                  type="text"
                  maxLength={280}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <button
                type="submit"
                className="rounded-md border border-accent bg-accentBg px-5 py-2.5 text-xs uppercase hover:bg-accentBgHover"
              >
                {t('clans.createButton')}
              </button>
            </form>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold">{t('clans.browseTitle')}</h2>
            {clans && clans.length === 0 && <p className="text-xs text-textFaint">{t('clans.noClans')}</p>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {clans?.map((clan) => (
                <div key={clan.id} className="rounded-lg border border-panelBorder bg-panel p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      <ClanLink clanId={clan.id} tag={clan.tag} name={clan.name} />
                    </span>
                    <span className="text-[10px] uppercase text-textFaint">
                      {clan.memberCount}/{clan.memberCap}
                    </span>
                  </div>
                  {clan.description && <p className="mb-3 text-xs text-textMuted">{clan.description}</p>}
                  <p className="mb-3 text-[10px] text-textFaint">
                    {t('clans.leader')}: <PlayerLink playerId={clan.leaderId} username={clan.leaderUsername} />
                  </p>
                  <button
                    type="button"
                    disabled={clan.memberCount >= clan.memberCap}
                    onClick={() => handleJoin(clan.id)}
                    className="w-full rounded-md border border-accent bg-accentBg py-2 text-[11px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {t('clans.join')}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {myClan && (
        <section className="rounded-lg border border-panelBorder bg-panel p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              <ClanLink clanId={myClan.id} tag={myClan.tag} name={myClan.name} />
            </h2>
            <span className="text-[10px] uppercase text-textFaint">
              {myClan.memberCount}/{myClan.memberCap}
            </span>
          </div>
          {myClan.description && !editingClan && <p className="mb-2 text-xs text-textMuted">{myClan.description}</p>}

          {myClan.myRole === 'LEADER' && !editingClan && (
            <button
              type="button"
              onClick={() => {
                setEditName(myClan.name);
                setEditDescription(myClan.description ?? '');
                setEditingClan(true);
              }}
              className="mb-4 text-[10px] uppercase text-textMuted underline hover:text-text"
            >
              {t('clans.editClan')}
            </button>
          )}

          {editingClan && (
            <form onSubmit={handleUpdateClan} className="mb-4 flex flex-col gap-3 rounded-md border border-wellBorder bg-well p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-textFaint">{t('clans.editTitle')}</h3>
              <label className="flex flex-col gap-1.5 text-xs text-textMuted">
                {t('clans.name')}
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={30}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="rounded-md border border-wellBorder bg-ink px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-textMuted">
                {t('clans.description')}
                <input
                  type="text"
                  maxLength={280}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="rounded-md border border-wellBorder bg-ink px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-md border border-accent bg-accentBg px-4 py-2 text-[11px] uppercase hover:bg-accentBgHover"
                >
                  {t('clans.editSave')}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingClan(false)}
                  className="rounded-md border border-wellBorder bg-ink px-4 py-2 text-[11px] uppercase text-textMuted hover:bg-accentBgHover"
                >
                  {t('clans.editCancel')}
                </button>
              </div>
            </form>
          )}

          <div className="mb-4 rounded-md border border-wellBorder bg-well p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textFaint">{t('clans.treasury')}</h3>
            <div className="mb-3 flex gap-5 text-sm">
              <span>{t('resource.METAL')}: <strong>{myClan.treasury.metal.toLocaleString()}</strong></span>
              <span>{t('resource.CRYSTAL')}: <strong>{myClan.treasury.crystal.toLocaleString()}</strong></span>
              <span>{t('resource.CREDITS')}: <strong>{myClan.treasury.credits.toLocaleString()}</strong></span>
            </div>
            <form onSubmit={handleDonate} className="flex flex-wrap items-end gap-2">
              <label className="flex w-24 flex-col gap-1 text-[10px] text-textMuted">
                {t('resource.METAL')}
                <input
                  type="number"
                  min={1}
                  value={donateMetal}
                  onChange={(e) => setDonateMetal(e.target.value)}
                  className="rounded-md border border-wellBorder bg-ink px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="flex w-24 flex-col gap-1 text-[10px] text-textMuted">
                {t('resource.CRYSTAL')}
                <input
                  type="number"
                  min={1}
                  value={donateCrystal}
                  onChange={(e) => setDonateCrystal(e.target.value)}
                  className="rounded-md border border-wellBorder bg-ink px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="flex w-24 flex-col gap-1 text-[10px] text-textMuted">
                {t('resource.CREDITS')}
                <input
                  type="number"
                  min={1}
                  value={donateCredits}
                  onChange={(e) => setDonateCredits(e.target.value)}
                  className="rounded-md border border-wellBorder bg-ink px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <button
                type="submit"
                className="rounded-md border border-accent bg-accentBg px-4 py-2 text-[11px] uppercase hover:bg-accentBgHover"
              >
                {t('clans.donate')}
              </button>
            </form>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {myClan.buildings.map((building) => {
              const progress = buildingProgress(building);
              const canManage = myClan.myRole === 'LEADER' || myClan.myRole === 'OFFICER';
              return (
                <div key={building.key} className="rounded-md border border-wellBorder bg-well p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold">{t(building.nameKey)}</span>
                    <span className="text-[9px] uppercase text-textFaint">
                      {t('clans.buildingLevel')} {building.level}/{building.maxLevel}
                    </span>
                  </div>
                  <p className="mb-2 text-[10px] text-textMuted">{t(building.descriptionKey)}</p>

                  {progress.active ? (
                    <>
                      <div className="mb-1 flex justify-between text-[9px] text-textMuted">
                        <span>{t('clans.buildingInProgress')}</span>
                        <span className="tabular-nums">{formatDuration(progress.secondsLeft)}</span>
                      </div>
                      <div className="mb-2 h-[6px] overflow-hidden rounded-full bg-wellBorder">
                        <div className="h-full bg-accent transition-all" style={{ width: `${progress.percent}%` }} />
                      </div>
                    </>
                  ) : building.nextLevelCost ? (
                    <p className="mb-2 text-[10px] text-textFaint">
                      {building.nextLevelCost.metalCost}M / {building.nextLevelCost.crystalCost}C / {building.nextLevelCost.creditsCost}Cr ·{' '}
                      {formatDuration(building.nextLevelCost.constructionSeconds)}
                    </p>
                  ) : (
                    <p className="mb-2 text-[10px] text-textFaint">{t('clans.buildingMaxLevel')}</p>
                  )}

                  <button
                    type="button"
                    disabled={!canManage || progress.active || !building.nextLevelCost}
                    onClick={() => handleUpgradeBuilding(building.key)}
                    className="w-full rounded-md border border-accent bg-accentBg py-1.5 text-[10px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {t('clans.upgradeBuilding')}
                  </button>
                </div>
              );
            })}
          </div>

          <table className="mb-4 w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-textFaint">
                <th className="pb-2">{t('clans.member')}</th>
                <th className="pb-2">{t('clans.role')}</th>
                <th className="pb-2">{t('clans.contributed')}</th>
                <th className="pb-2 text-right">{t('clans.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {myClan.members.map((member) => (
                <tr key={member.playerId} className="border-t border-wellBorder">
                  <td className="py-2">
                    <PlayerLink playerId={member.playerId} username={member.username} />{' '}
                    {member.isCurrentPlayer && <span className="text-textFaint">({t('clans.you')})</span>}
                  </td>
                  <td className="py-2">{t(`clans.roleLabel.${member.role}`)}</td>
                  <td className="py-2 text-textMuted">
                    {member.contributed.metal + member.contributed.crystal + member.contributed.credits === 0
                      ? '—'
                      : `${member.contributed.metal}M / ${member.contributed.crystal}C / ${member.contributed.credits}Cr`}
                  </td>
                  <td className="py-2 text-right">
                    {!member.isCurrentPlayer && myClan.myRole === 'LEADER' && (
                      <div className="flex justify-end gap-1.5">
                        {member.role === 'MEMBER' && (
                          <button type="button" onClick={() => handlePromote(member.playerId)} className="text-positive underline">
                            {t('clans.promote')}
                          </button>
                        )}
                        {member.role === 'OFFICER' && (
                          <button type="button" onClick={() => handleDemote(member.playerId)} className="text-textMuted underline">
                            {t('clans.demote')}
                          </button>
                        )}
                        <button type="button" onClick={() => handleTransfer(member.playerId)} className="text-textMuted underline">
                          {t('clans.transferLeadership')}
                        </button>
                        <button type="button" onClick={() => handleKick(member.playerId)} className="text-danger underline">
                          {t('clans.kick')}
                        </button>
                      </div>
                    )}
                    {!member.isCurrentPlayer && myClan.myRole === 'OFFICER' && member.role === 'MEMBER' && (
                      <button type="button" onClick={() => handleKick(member.playerId)} className="text-danger underline">
                        {t('clans.kick')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleLeave}
              className="flex-1 rounded-md border border-panelBorderDanger bg-well py-2.5 text-[11px] uppercase text-danger hover:bg-accentBgHover"
            >
              {t('clans.leave')}
            </button>
            {myClan.myRole === 'LEADER' && (
              <button
                type="button"
                onClick={handleDisband}
                className="flex-1 rounded-md border border-panelBorderDanger bg-well py-2.5 text-[11px] uppercase text-danger hover:bg-accentBgHover"
              >
                {t('clans.disband')}
              </button>
            )}
          </div>
        </section>
      )}
    </GameLayout>
  );
}
