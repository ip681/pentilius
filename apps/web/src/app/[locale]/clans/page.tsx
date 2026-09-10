'use client';

import type {
  ClanBuildingStateDto,
  ClanDetailDto,
  ClanMemberDto,
  ClanMessageDto,
  ClanRole,
  ClanSummaryDto,
  ClanWarHistoryEntryDto,
  ClanWarStateDto,
  PlayerProfileDto,
  Race,
  RobotAttributesDto,
} from '@pentilius/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { ClanLink } from '@/components/ClanLink';
import { GameLayout } from '@/components/GameLayout';
import { NextLevelValue } from '@/components/NextLevelValue';
import { PlayerLink } from '@/components/PlayerLink';
import { ResourceIcon } from '@/components/ResourceIcon';
import { Link } from '@/i18n/navigation';
import { hasAnyRequirement, meetsJoinRequirements } from '@/lib/clan-requirements';
import { formatDateTime } from '@/lib/format-datetime';
import { formatRelativeTime } from '@/lib/format-relative-time';
import {
  ApiError,
  createClan,
  declareClanWar,
  demoteClanMember,
  disbandClan,
  donateToClan,
  getClanMessages,
  getClanWarHistory,
  getClanWarStatus,
  getMyClan,
  getProfile,
  getRobotAttributes,
  joinClan,
  kickClanMember,
  leaveClan,
  listClans,
  promoteClanMember,
  sendClanMessage,
  transferClanLeadership,
  updateClan,
  updateClanJoinRequirements,
  upgradeClanBuilding,
} from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { notifyProfileChanged } from '@/lib/profile-events';
import { useRequireAuth } from '@/lib/use-require-auth';

const ALL_RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];

type ClanAction = 'promote' | 'demote' | 'transfer' | 'kick';

const ACTION_LABEL_KEY: Record<ClanAction, string> = {
  promote: 'clans.promote',
  demote: 'clans.demote',
  transfer: 'clans.transferLeadership',
  kick: 'clans.kick',
};

const ACTION_CONFIRM_KEY: Record<ClanAction, string> = {
  promote: 'clans.confirmPromote',
  demote: 'clans.confirmDemote',
  transfer: 'clans.confirmTransfer',
  kick: 'clans.confirmKick',
};

const ACTION_IS_DANGER: Record<ClanAction, boolean> = {
  promote: false,
  demote: false,
  transfer: false,
  kick: true,
};

function availableActions(member: ClanMemberDto, myRole: ClanRole | null): ClanAction[] {
  if (member.isCurrentPlayer) return [];
  if (myRole === 'LEADER') {
    const actions: ClanAction[] = [];
    if (member.role === 'MEMBER') actions.push('promote');
    if (member.role === 'OFFICER') actions.push('demote');
    actions.push('transfer', 'kick');
    return actions;
  }
  if (myRole === 'OFFICER' && member.role === 'MEMBER') {
    return ['kick'];
  }
  return [];
}

type ClanOptionAction = 'leave' | 'disband';

const CLAN_OPTION_LABEL_KEY: Record<ClanOptionAction, string> = {
  leave: 'clans.leave',
  disband: 'clans.disband',
};

const CLAN_OPTION_CONFIRM_KEY: Record<ClanOptionAction, string> = {
  leave: 'clans.confirmLeave',
  disband: 'clans.confirmDisband',
};

/** Current bonus at this building's level, and next level's if it isn't already maxed — e.g. "+10 (+12 at next level)". */
function bonusLabel(building: ClanBuildingStateDto): { current: string; next: string | null } {
  const format = (value: number) => (building.bonusType === 'MEMBER_CAPACITY' ? `+${Math.round(value)}` : `+${Math.round(value * 100)}%`);
  const current = format(building.level * building.bonusPerLevel);
  if (!building.nextLevelCost) return { current, next: null };
  return { current, next: format((building.level + 1) * building.bonusPerLevel) };
}

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
  const locale = useLocale();
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
  const [messages, setMessages] = useState<ClanMessageDto[] | null>(null);
  const [chatText, setChatText] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const chatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [actionSheetPlayerId, setActionSheetPlayerId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ClanAction | null>(null);
  const [clanOptionsOpen, setClanOptionsOpen] = useState(false);
  const [pendingClanAction, setPendingClanAction] = useState<ClanOptionAction | null>(null);
  const [warStatus, setWarStatus] = useState<ClanWarStateDto | null>(null);
  const [declareWarTargetId, setDeclareWarTargetId] = useState('');
  const [declareWarConfirmOpen, setDeclareWarConfirmOpen] = useState(false);
  const [myProfile, setMyProfile] = useState<PlayerProfileDto | null>(null);
  const [myAttributes, setMyAttributes] = useState<RobotAttributesDto | null>(null);
  const [editingRequirements, setEditingRequirements] = useState(false);
  const [reqMinLevel, setReqMinLevel] = useState('0');
  const [reqMinDamage, setReqMinDamage] = useState('0');
  const [reqMinDefense, setReqMinDefense] = useState('0');
  const [reqMinHp, setReqMinHp] = useState('0');
  const [reqMinEvasion, setReqMinEvasion] = useState('0');
  const [reqAllowedRaces, setReqAllowedRaces] = useState<Race[]>([]);
  const [warHistory, setWarHistory] = useState<ClanWarHistoryEntryDto[] | null>(null);

  async function load() {
    try {
      const [mine, list, profile, attributes] = await Promise.all([getMyClan(), listClans(), getProfile(), getRobotAttributes()]);
      setMyClan(mine.clan);
      setClans(list);
      setMyProfile(profile);
      setMyAttributes(attributes);
      setWarStatus(mine.clan ? (await getClanWarStatus()).war : null);
      setWarHistory(mine.clan ? await getClanWarHistory() : null);
    } catch {
      setError(t('clans.loadError'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMessages(clanId: string) {
    try {
      const msgs = await getClanMessages(clanId);
      setMessages(msgs);
    } catch {
      // Silent — a transient poll miss shouldn't clobber the page's main error banner.
    }
  }

  useEffect(() => {
    if (chatIntervalRef.current) {
      clearInterval(chatIntervalRef.current);
      chatIntervalRef.current = null;
    }
    if (!myClan) {
      setMessages(null);
      return;
    }
    loadMessages(myClan.id);
    chatIntervalRef.current = setInterval(() => loadMessages(myClan.id), 5000);
    return () => {
      if (chatIntervalRef.current) clearInterval(chatIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myClan?.id]);

  function errorMessage(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
      const map: Record<string, string> = {
        ALREADY_IN_CLAN: t('clans.errorAlreadyInClan'),
        CLAN_NAME_TAKEN: t('clans.errorNameTaken'),
        CLAN_TAG_TAKEN: t('clans.errorTagTaken'),
        CLAN_FULL: t('clans.errorFull'),
        NOT_ENOUGH_RESOURCES: t('clans.errorNotEnoughResources'),
        NOT_ENOUGH_TREASURY: t('clans.errorNotEnoughTreasury'),
        SENDING_TOO_FAST: t('clans.errorSendingTooFast'),
        ALREADY_AT_WAR: t('clans.war.errorAlreadyAtWar'),
        TARGET_ALREADY_AT_WAR: t('clans.war.errorTargetAlreadyAtWar'),
        CLAN_TOO_SMALL: t('clans.war.errorClanTooSmall'),
        TARGET_TOO_SMALL: t('clans.war.errorTargetTooSmall'),
        REMATCH_COOLDOWN: t('clans.war.errorRematchCooldown'),
        JOIN_REQUIREMENTS_NOT_MET: t('clans.errorRequirementsNotMet'),
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
    setError(null);
    try {
      await leaveClan();
      await load();
    } catch {
      setError(t('clans.actionError'));
    }
  }

  async function handleDisband() {
    setError(null);
    try {
      await disbandClan();
      await load();
    } catch {
      setError(t('clans.actionError'));
    }
  }

  async function handleKick(playerId: string) {
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
    setError(null);
    try {
      await transferClanLeadership(playerId);
      await load();
    } catch {
      setError(t('clans.actionError'));
    }
  }

  function closeActionSheet() {
    setActionSheetPlayerId(null);
    setPendingAction(null);
  }

  const ACTION_HANDLER: Record<ClanAction, (playerId: string) => void> = {
    promote: handlePromote,
    demote: handleDemote,
    transfer: handleTransfer,
    kick: handleKick,
  };

  function closeClanOptions() {
    setClanOptionsOpen(false);
    setPendingClanAction(null);
  }

  const CLAN_OPTION_HANDLER: Record<ClanOptionAction, () => void> = {
    leave: handleLeave,
    disband: handleDisband,
  };

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

  function openRequirementsEditor() {
    if (!myClan) return;
    setReqMinLevel(String(myClan.joinRequirements.minLevel));
    setReqMinDamage(String(myClan.joinRequirements.minAttributes.damage));
    setReqMinDefense(String(myClan.joinRequirements.minAttributes.defense));
    setReqMinHp(String(myClan.joinRequirements.minAttributes.hp));
    setReqMinEvasion(String(myClan.joinRequirements.minAttributes.evasion));
    setReqAllowedRaces(myClan.joinRequirements.allowedRaces);
    setEditingRequirements(true);
  }

  function toggleAllowedRace(race: Race) {
    setReqAllowedRaces((prev) => (prev.includes(race) ? prev.filter((r) => r !== race) : [...prev, race]));
  }

  async function handleUpdateRequirements(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await updateClanJoinRequirements({
        minLevel: Number(reqMinLevel) || 0,
        minDamage: Number(reqMinDamage) || 0,
        minDefense: Number(reqMinDefense) || 0,
        minHp: Number(reqMinHp) || 0,
        minEvasion: Number(reqMinEvasion) || 0,
        allowedRaces: reqAllowedRaces,
      });
      setEditingRequirements(false);
      await load();
    } catch (err) {
      setError(errorMessage(err, t('clans.requirementsError')));
    }
  }

  async function handleSendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!myClan || !chatText.trim()) return;
    setChatError(null);
    try {
      await sendClanMessage(myClan.id, chatText.trim());
      setChatText('');
      await loadMessages(myClan.id);
    } catch (err) {
      setChatError(errorMessage(err, t('clans.chatSendError')));
    }
  }

  async function handleDeclareWar() {
    if (!declareWarTargetId) return;
    setError(null);
    try {
      await declareClanWar(declareWarTargetId);
      setDeclareWarTargetId('');
      await load();
    } catch (err) {
      setError(errorMessage(err, t('clans.declareWarError')));
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
      notifyProfileChanged();
      await load();
    } catch (err) {
      setError(errorMessage(err, t('clans.donateError')));
    }
  }

  const actionSheetMember = myClan?.members.find((m) => m.playerId === actionSheetPlayerId) ?? null;

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
              {clans?.map((clan) => {
                const eligible = meetsJoinRequirements(clan, myProfile, myAttributes);
                const full = clan.memberCount >= clan.memberCap;
                return (
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

                    {hasAnyRequirement(clan.joinRequirements) && (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {clan.joinRequirements.minLevel > 0 && (
                          <span className="rounded border border-wellBorder bg-well px-1.5 py-0.5 text-[9px] uppercase text-textMuted">
                            {t('clans.reqLevel', { value: clan.joinRequirements.minLevel })}
                          </span>
                        )}
                        {clan.joinRequirements.minAttributes.damage > 0 && (
                          <span className="rounded border border-wellBorder bg-well px-1.5 py-0.5 text-[9px] uppercase text-textMuted">
                            {t('clans.reqDamage', { value: clan.joinRequirements.minAttributes.damage })}
                          </span>
                        )}
                        {clan.joinRequirements.minAttributes.defense > 0 && (
                          <span className="rounded border border-wellBorder bg-well px-1.5 py-0.5 text-[9px] uppercase text-textMuted">
                            {t('clans.reqDefense', { value: clan.joinRequirements.minAttributes.defense })}
                          </span>
                        )}
                        {clan.joinRequirements.minAttributes.hp > 0 && (
                          <span className="rounded border border-wellBorder bg-well px-1.5 py-0.5 text-[9px] uppercase text-textMuted">
                            {t('clans.reqHp', { value: clan.joinRequirements.minAttributes.hp })}
                          </span>
                        )}
                        {clan.joinRequirements.minAttributes.evasion > 0 && (
                          <span className="rounded border border-wellBorder bg-well px-1.5 py-0.5 text-[9px] uppercase text-textMuted">
                            {t('clans.reqEvasion', { value: clan.joinRequirements.minAttributes.evasion })}
                          </span>
                        )}
                        {clan.joinRequirements.allowedRaces.map((race) => (
                          <span key={race} className="flex items-center gap-1 rounded border border-wellBorder bg-well px-1.5 py-0.5 text-[9px] uppercase text-textMuted">
                            <AssetIcon
                              assetId={`races.${race.toLowerCase()}.icon`}
                              alt={t(`race.${race}.name`)}
                              className="h-3 w-3 object-contain"
                              fallback={<div className="h-3 w-3 rounded-sm bg-accent opacity-60" />}
                            />
                            {t(`race.${race}.name`)}
                          </span>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={full || !eligible}
                      title={!eligible ? t('clans.errorRequirementsNotMet') : undefined}
                      onClick={() => handleJoin(clan.id)}
                      className="w-full rounded-md border border-accent bg-accentBg py-2 text-[11px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {t('clans.join')}
                    </button>
                  </div>
                );
              })}
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

          {warStatus ? (
            <Link
              href="/clan-war"
              className="mb-4 flex items-center justify-between rounded-md border border-panelBorderDanger bg-well px-4 py-2.5 text-xs uppercase text-danger hover:bg-accentBgHover"
            >
              <span>{t('clans.war.atWarWith', { clan: `[${warStatus.enemyClanTag}] ${warStatus.enemyClanName}` })}</span>
              <span className="text-textFaint">{t('clans.war.viewBattle')} →</span>
            </Link>
          ) : (
            (myClan.myRole === 'LEADER' || myClan.myRole === 'OFFICER') && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-wellBorder bg-well p-3">
                <select
                  value={declareWarTargetId}
                  onChange={(e) => setDeclareWarTargetId(e.target.value)}
                  className="flex-1 rounded-md border border-wellBorder bg-ink px-3 py-2 text-xs text-text outline-none focus:border-accent"
                >
                  <option value="">{t('clans.war.pickTarget')}</option>
                  {clans
                    ?.filter((c) => c.id !== myClan.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.tag}] {c.name} ({c.memberCount})
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!declareWarTargetId}
                  onClick={() => setDeclareWarConfirmOpen(true)}
                  className="rounded-md border border-panelBorderDanger bg-well px-4 py-2 text-[11px] uppercase text-danger hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {t('clans.war.declareWar')}
                </button>
              </div>
            )
          )}

          <BottomSheet open={declareWarConfirmOpen} onClose={() => setDeclareWarConfirmOpen(false)}>
            <p className="mb-4 text-sm text-textMuted">{t('clans.war.confirmDeclareWar')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  handleDeclareWar();
                  setDeclareWarConfirmOpen(false);
                }}
                className="flex-1 rounded-md border border-panelBorderDanger bg-well py-2.5 text-xs uppercase text-danger hover:bg-accentBgHover"
              >
                {t('common.confirm')}
              </button>
              <button
                type="button"
                onClick={() => setDeclareWarConfirmOpen(false)}
                className="flex-1 rounded-md border border-panelBorder bg-panel py-2.5 text-xs uppercase text-textMuted hover:bg-accentBgHover"
              >
                {t('common.cancel')}
              </button>
            </div>
          </BottomSheet>

          {(!editingClan || !editingRequirements) && (
            <div className="mb-4 flex justify-end gap-2">
              {myClan.myRole === 'LEADER' && !editingClan && (
                <button
                  type="button"
                  onClick={() => {
                    setEditName(myClan.name);
                    setEditDescription(myClan.description ?? '');
                    setEditingClan(true);
                  }}
                  className="rounded-md border border-wellBorder bg-well px-3 py-1.5 text-[10px] uppercase text-textMuted hover:bg-accentBgHover"
                >
                  {t('clans.editClan')}
                </button>
              )}
              {(myClan.myRole === 'LEADER' || myClan.myRole === 'OFFICER') && !editingRequirements && (
                <button
                  type="button"
                  onClick={openRequirementsEditor}
                  className="rounded-md border border-wellBorder bg-well px-3 py-1.5 text-[10px] uppercase text-textMuted hover:bg-accentBgHover"
                >
                  {t('clans.editRequirements')}
                </button>
              )}
            </div>
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

          {editingRequirements && (
            <form onSubmit={handleUpdateRequirements} className="mb-4 flex flex-col gap-3 rounded-md border border-wellBorder bg-well p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-textFaint">{t('clans.requirementsTitle')}</h3>
              <p className="text-[10px] text-textFaint">{t('clans.requirementsHint')}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <label className="flex flex-col gap-1 text-[10px] text-textMuted">
                  {t('clans.reqLevelLabel')}
                  <input
                    type="number"
                    min={0}
                    value={reqMinLevel}
                    onChange={(e) => setReqMinLevel(e.target.value)}
                    className="rounded-md border border-wellBorder bg-ink px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] text-textMuted">
                  {t('robot.stat.damage')}
                  <input
                    type="number"
                    min={0}
                    value={reqMinDamage}
                    onChange={(e) => setReqMinDamage(e.target.value)}
                    className="rounded-md border border-wellBorder bg-ink px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] text-textMuted">
                  {t('robot.stat.defense')}
                  <input
                    type="number"
                    min={0}
                    value={reqMinDefense}
                    onChange={(e) => setReqMinDefense(e.target.value)}
                    className="rounded-md border border-wellBorder bg-ink px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] text-textMuted">
                  {t('robot.stat.hp')}
                  <input
                    type="number"
                    min={0}
                    value={reqMinHp}
                    onChange={(e) => setReqMinHp(e.target.value)}
                    className="rounded-md border border-wellBorder bg-ink px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] text-textMuted">
                  {t('robot.stat.evasion')}
                  <input
                    type="number"
                    min={0}
                    value={reqMinEvasion}
                    onChange={(e) => setReqMinEvasion(e.target.value)}
                    className="rounded-md border border-wellBorder bg-ink px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] uppercase text-textFaint">{t('clans.reqRacesLabel')}</span>
                <div className="flex flex-wrap gap-2">
                  {ALL_RACES.map((race) => (
                    <label key={race} className="flex items-center gap-1.5 text-[10px] text-textMuted">
                      <input
                        type="checkbox"
                        checked={reqAllowedRaces.includes(race)}
                        onChange={() => toggleAllowedRace(race)}
                        className="accent-accent"
                      />
                      <AssetIcon
                        assetId={`races.${race.toLowerCase()}.icon`}
                        alt={t(`race.${race}.name`)}
                        className="h-4 w-4 object-contain"
                        fallback={<div className="h-4 w-4 rounded-sm bg-accent opacity-60" />}
                      />
                      {t(`race.${race}.name`)}
                    </label>
                  ))}
                </div>
                <p className="text-[9px] text-textFaint">{t('clans.reqRacesHint')}</p>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-md border border-accent bg-accentBg px-4 py-2 text-[11px] uppercase hover:bg-accentBgHover"
                >
                  {t('clans.editSave')}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRequirements(false)}
                  className="rounded-md border border-wellBorder bg-ink px-4 py-2 text-[11px] uppercase text-textMuted hover:bg-accentBgHover"
                >
                  {t('clans.editCancel')}
                </button>
              </div>
            </form>
          )}

          <div className="mb-4 rounded-md border border-wellBorder bg-well p-4">
            <div className="mb-2 flex items-center gap-2">
              <AssetIcon
                assetId="clans.treasury.icon"
                alt={t('clans.treasury')}
                className="h-6 w-6 object-contain"
                fallback={<span className="text-xs font-semibold text-textMuted">{t('clans.treasury').charAt(0)}</span>}
              />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-textFaint">{t('clans.treasury')}</h3>
            </div>
            <div className="mb-3 flex gap-5 text-sm">
              <span className="flex items-center gap-1.5"><ResourceIcon type="METAL" /><strong>{myClan.treasury.metal.toLocaleString()}</strong></span>
              <span className="flex items-center gap-1.5"><ResourceIcon type="CRYSTAL" /><strong>{myClan.treasury.crystal.toLocaleString()}</strong></span>
              <span className="flex items-center gap-1.5"><ResourceIcon type="CREDITS" /><strong>{myClan.treasury.credits.toLocaleString()}</strong></span>
            </div>
            <form onSubmit={handleDonate} className="flex flex-wrap items-end gap-2">
              <label className="flex w-24 flex-col gap-1 text-[10px] text-textMuted">
                <span className="flex items-center gap-1"><ResourceIcon type="METAL" className="h-3.5 w-3.5" />{t('resource.METAL')}</span>
                <input
                  type="number"
                  min={1}
                  value={donateMetal}
                  onChange={(e) => setDonateMetal(e.target.value)}
                  className="rounded-md border border-wellBorder bg-ink px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="flex w-24 flex-col gap-1 text-[10px] text-textMuted">
                <span className="flex items-center gap-1"><ResourceIcon type="CRYSTAL" className="h-3.5 w-3.5" />{t('resource.CRYSTAL')}</span>
                <input
                  type="number"
                  min={1}
                  value={donateCrystal}
                  onChange={(e) => setDonateCrystal(e.target.value)}
                  className="rounded-md border border-wellBorder bg-ink px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="flex w-24 flex-col gap-1 text-[10px] text-textMuted">
                <span className="flex items-center gap-1"><ResourceIcon type="CREDITS" className="h-3.5 w-3.5" />{t('resource.CREDITS')}</span>
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
              const bonus = bonusLabel(building);
              return (
                <div key={building.key} className="rounded-md border border-wellBorder bg-well p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <AssetIcon
                        assetId={`clanBuildings.${building.key}.icon`}
                        alt={t(building.nameKey)}
                        className="h-6 w-6 object-contain"
                        fallback={<span className="text-xs font-semibold text-textMuted">{t(building.nameKey).charAt(0)}</span>}
                      />
                      {t(building.nameKey)}
                    </span>
                    <span className="text-[9px] uppercase text-textFaint">
                      {t('clans.buildingLevel')} {building.level}/{building.maxLevel}
                    </span>
                  </div>
                  <p className="mb-1 text-[10px] text-textMuted">{t(building.descriptionKey)}</p>
                  <p className="mb-2 text-[10px] text-accent">
                    <NextLevelValue current={bonus.current} next={bonus.next} />
                  </p>

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
                    <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-textFaint">
                      <span className="flex items-center gap-1">
                        <ResourceIcon type="METAL" className="h-3.5 w-3.5" />
                        {building.nextLevelCost.metalCost}
                      </span>
                      <span className="flex items-center gap-1">
                        <ResourceIcon type="CRYSTAL" className="h-3.5 w-3.5" />
                        {building.nextLevelCost.crystalCost}
                      </span>
                      <span className="flex items-center gap-1">
                        <ResourceIcon type="CREDITS" className="h-3.5 w-3.5" />
                        {building.nextLevelCost.creditsCost}
                      </span>
                      <span>· {formatDuration(building.nextLevelCost.constructionSeconds)}</span>
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

          <div className="mb-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-textFaint">
                <th className="pb-2">{t('clans.level')}</th>
                <th className="pb-2">{t('clans.member')}</th>
                <th className="pb-2">{t('clans.role')}</th>
                <th className="pb-2 text-right" title={t('resource.METAL')}>
                  <ResourceIcon type="METAL" className="ml-auto h-4 w-4" />
                </th>
                <th className="pb-2 text-right" title={t('resource.CRYSTAL')}>
                  <ResourceIcon type="CRYSTAL" className="ml-auto h-4 w-4" />
                </th>
                <th className="pb-2 text-right" title={t('resource.CREDITS')}>
                  <ResourceIcon type="CREDITS" className="ml-auto h-4 w-4" />
                </th>
                <th className="pb-2 text-right">{t('clans.lastActive')}</th>
                <th className="pb-2 text-right">{t('clans.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {myClan.members.map((member) => (
                <tr key={member.playerId} className="border-t border-wellBorder">
                  <td className="py-2 text-textMuted">{member.level}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-1.5">
                      <AssetIcon
                        assetId={`races.${member.race.toLowerCase()}.icon`}
                        alt={t(`race.${member.race}.name`)}
                        className="h-4 w-4 shrink-0 object-contain"
                        fallback={<div className="h-4 w-4 shrink-0 rounded-sm bg-accent opacity-60" />}
                      />
                      <PlayerLink playerId={member.playerId} username={member.username} />
                      {member.isCurrentPlayer && <span className="text-textFaint">({t('clans.you')})</span>}
                    </div>
                  </td>
                  <td className="py-2">{t(`clans.roleLabel.${member.role}`)}</td>
                  <td className="py-2 text-right text-textMuted">{member.contributed.metal || '—'}</td>
                  <td className="py-2 text-right text-textMuted">{member.contributed.crystal || '—'}</td>
                  <td className="py-2 text-right text-textMuted">{member.contributed.credits || '—'}</td>
                  <td className="py-2 text-right">
                    {member.online ? (
                      <span className="text-positive">{t('clans.online')}</span>
                    ) : (
                      <span className="text-textFaint">{formatRelativeTime(member.lastActiveAt, locale)}</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {availableActions(member, myClan.myRole).length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setActionSheetPlayerId(member.playerId);
                          setPendingAction(null);
                        }}
                        className="whitespace-nowrap rounded-md border border-wellBorder bg-well px-3 py-1.5 text-[10px] uppercase text-textMuted hover:bg-accentBgHover"
                      >
                        {t('clans.action')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {warHistory && warHistory.length > 0 && (
            <div className="mb-4 rounded-md border border-wellBorder bg-well p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textFaint">{t('clans.war.history')}</h3>
              <div className="flex flex-col gap-2">
                {warHistory.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-md border border-wellBorder bg-ink px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate">
                        <span
                          className={
                            entry.won === true ? 'font-semibold text-positive' : entry.won === false ? 'font-semibold text-danger' : 'font-semibold text-textMuted'
                          }
                        >
                          {entry.won === true ? t('clans.war.outcomeWon') : entry.won === false ? t('clans.war.outcomeLost') : t('clans.war.outcomeDraw')}
                        </span>{' '}
                        <span className="text-textFaint">
                          {t(`clans.war.outcomeType.${entry.outcome}`)} · {t('clans.war.vs')} [{entry.opponentClanTag}] {entry.opponentClanName}
                        </span>
                      </p>
                      <p className="text-[10px] text-textFaint">{formatDateTime(entry.resolvedAt)}</p>
                    </div>
                    {(entry.treasuryMetalChange !== 0 || entry.treasuryCrystalChange !== 0 || entry.treasuryCreditsChange !== 0) && (
                      <div className="flex shrink-0 items-center gap-2 text-[10px]">
                        {entry.treasuryMetalChange !== 0 && (
                          <span className={entry.treasuryMetalChange > 0 ? 'text-positive' : 'text-danger'}>
                            {entry.treasuryMetalChange > 0 ? '+' : ''}
                            {entry.treasuryMetalChange.toLocaleString()} <ResourceIcon type="METAL" className="inline h-3 w-3" />
                          </span>
                        )}
                        {entry.treasuryCrystalChange !== 0 && (
                          <span className={entry.treasuryCrystalChange > 0 ? 'text-positive' : 'text-danger'}>
                            {entry.treasuryCrystalChange > 0 ? '+' : ''}
                            {entry.treasuryCrystalChange.toLocaleString()} <ResourceIcon type="CRYSTAL" className="inline h-3 w-3" />
                          </span>
                        )}
                        {entry.treasuryCreditsChange !== 0 && (
                          <span className={entry.treasuryCreditsChange > 0 ? 'text-positive' : 'text-danger'}>
                            {entry.treasuryCreditsChange > 0 ? '+' : ''}
                            {entry.treasuryCreditsChange.toLocaleString()} <ResourceIcon type="CREDITS" className="inline h-3 w-3" />
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <BottomSheet open={!!actionSheetMember} onClose={closeActionSheet}>
            {actionSheetMember &&
              (pendingAction ? (
                <>
                  <p className="mb-4 text-sm text-textMuted">{t(ACTION_CONFIRM_KEY[pendingAction])}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        ACTION_HANDLER[pendingAction](actionSheetMember.playerId);
                        closeActionSheet();
                      }}
                      className={`flex-1 rounded-md border py-2.5 text-xs uppercase hover:bg-accentBgHover ${
                        ACTION_IS_DANGER[pendingAction] ? 'border-panelBorderDanger bg-well text-danger' : 'border-accent bg-accentBg text-text'
                      }`}
                    >
                      {t('common.confirm')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingAction(null)}
                      className="flex-1 rounded-md border border-panelBorder bg-panel py-2.5 text-xs uppercase text-textMuted hover:bg-accentBgHover"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="mb-3 text-sm font-semibold">{actionSheetMember.username}</h3>
                  <div className="flex flex-col gap-2">
                    {availableActions(actionSheetMember, myClan.myRole).map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => setPendingAction(action)}
                        className={`rounded-md border py-2.5 text-xs uppercase hover:bg-accentBgHover ${
                          ACTION_IS_DANGER[action] ? 'border-panelBorderDanger bg-well text-danger' : 'border-wellBorder bg-well text-text'
                        }`}
                      >
                        {t(ACTION_LABEL_KEY[action])}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={closeActionSheet} className="mt-3 w-full text-center text-xs text-textFaint underline">
                    {t('common.close')}
                  </button>
                </>
              ))}
          </BottomSheet>

          <div className="mb-4 rounded-md border border-wellBorder bg-well p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textFaint">{t('clans.chat')}</h3>
            <div className="mb-2 flex h-[220px] flex-col-reverse overflow-y-auto rounded border border-wellBorder bg-ink p-2.5">
              <div>
                {messages && messages.length === 0 && <p className="text-[11px] text-textFaint">{t('clans.chatEmpty')}</p>}
                {messages?.map((message) => (
                  <div key={message.id} className="mb-1.5 text-xs">
                    <span className="text-[9px] text-textFaint">{formatDateTime(message.createdAt)}</span>{' '}
                    <PlayerLink playerId={message.playerId} username={message.username} className="font-semibold hover:text-accent" />
                    {': '}
                    <span className="text-textMuted">{message.text}</span>
                  </div>
                ))}
              </div>
            </div>
            {chatError && <p className="mb-2 text-[11px] text-danger">{chatError}</p>}
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                maxLength={500}
                placeholder={t('clans.chatPlaceholder')}
                className="flex-1 rounded-md border border-wellBorder bg-ink px-3 py-2 text-xs text-text outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={!chatText.trim()}
                className="rounded-md border border-accent bg-accentBg px-4 py-2 text-[11px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
              >
                {t('clans.chatSend')}
              </button>
            </form>
          </div>

          <button
            type="button"
            onClick={() => setClanOptionsOpen(true)}
            className="rounded-md border border-wellBorder bg-well px-4 py-2 text-[11px] uppercase text-textMuted hover:bg-accentBgHover"
          >
            {t('clans.options')}
          </button>

          <BottomSheet open={clanOptionsOpen} onClose={closeClanOptions}>
            {pendingClanAction ? (
              <>
                <p className="mb-4 text-sm text-textMuted">{t(CLAN_OPTION_CONFIRM_KEY[pendingClanAction])}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      CLAN_OPTION_HANDLER[pendingClanAction]();
                      closeClanOptions();
                    }}
                    className="flex-1 rounded-md border border-panelBorderDanger bg-well py-2.5 text-xs uppercase text-danger hover:bg-accentBgHover"
                  >
                    {t('common.confirm')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingClanAction(null)}
                    className="flex-1 rounded-md border border-panelBorder bg-panel py-2.5 text-xs uppercase text-textMuted hover:bg-accentBgHover"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="mb-3 text-sm font-semibold">{t('clans.options')}</h3>
                <div className="flex flex-col gap-2">
                  {(myClan.myRole === 'LEADER' ? (['leave', 'disband'] as const) : (['leave'] as const)).map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => setPendingClanAction(action)}
                      className="rounded-md border border-panelBorderDanger bg-well py-2.5 text-xs uppercase text-danger hover:bg-accentBgHover"
                    >
                      {t(CLAN_OPTION_LABEL_KEY[action])}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={closeClanOptions} className="mt-3 w-full text-center text-xs text-textFaint underline">
                  {t('common.close')}
                </button>
              </>
            )}
          </BottomSheet>
        </section>
      )}
    </GameLayout>
  );
}
