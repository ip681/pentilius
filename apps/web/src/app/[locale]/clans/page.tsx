'use client';

import type { ClanDetailDto, ClanSummaryDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GameLayout } from '@/components/GameLayout';
import {
  ApiError,
  createClan,
  demoteClanMember,
  disbandClan,
  getMyClan,
  joinClan,
  kickClanMember,
  leaveClan,
  listClans,
  promoteClanMember,
  transferClanLeadership,
} from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function ClansPage() {
  useRequireAuth();
  const t = useTranslations();
  const [myClan, setMyClan] = useState<ClanDetailDto | null | undefined>(undefined);
  const [clans, setClans] = useState<ClanSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');

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
                      [{clan.tag}] {clan.name}
                    </span>
                    <span className="text-[10px] uppercase text-textFaint">
                      {clan.memberCount}/{clan.memberCap}
                    </span>
                  </div>
                  {clan.description && <p className="mb-3 text-xs text-textMuted">{clan.description}</p>}
                  <p className="mb-3 text-[10px] text-textFaint">{t('clans.leader')}: {clan.leaderUsername}</p>
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
              [{myClan.tag}] {myClan.name}
            </h2>
            <span className="text-[10px] uppercase text-textFaint">
              {myClan.memberCount}/{myClan.memberCap}
            </span>
          </div>
          {myClan.description && <p className="mb-4 text-xs text-textMuted">{myClan.description}</p>}

          <table className="mb-4 w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-textFaint">
                <th className="pb-2">{t('clans.member')}</th>
                <th className="pb-2">{t('clans.role')}</th>
                <th className="pb-2 text-right">{t('clans.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {myClan.members.map((member) => (
                <tr key={member.playerId} className="border-t border-wellBorder">
                  <td className="py-2">
                    {member.username} {member.isCurrentPlayer && <span className="text-textFaint">({t('clans.you')})</span>}
                  </td>
                  <td className="py-2">{t(`clans.roleLabel.${member.role}`)}</td>
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
