'use client';

import type { ClanDetailDto, ClanWarStateDto, PlayerProfileDto, RobotAttributesDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { GameLayout } from '@/components/GameLayout';
import { PlayerLink } from '@/components/PlayerLink';
import { Link } from '@/i18n/navigation';
import { ApiError, declareClanWar, getClan, getClanWarStatus, getMyClan, getProfile, getRobotAttributes, joinClan } from '@/lib/api-client';
import { hasAnyRequirement, meetsJoinRequirements } from '@/lib/clan-requirements';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function ClanDetailPage() {
  useRequireAuth();
  const t = useTranslations();
  const params = useParams<{ id: string }>();
  const clanId = params.id;

  const [clan, setClan] = useState<ClanDetailDto | null>(null);
  const [hasClan, setHasClan] = useState<boolean | null>(null);
  const [myClan, setMyClan] = useState<ClanDetailDto | null>(null);
  const [myWarStatus, setMyWarStatus] = useState<ClanWarStateDto | null>(null);
  const [myProfile, setMyProfile] = useState<PlayerProfileDto | null>(null);
  const [myAttributes, setMyAttributes] = useState<RobotAttributesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declareWarConfirmOpen, setDeclareWarConfirmOpen] = useState(false);

  async function load() {
    try {
      const [clanRes, mine, profile, attributes] = await Promise.all([getClan(clanId), getMyClan(), getProfile(), getRobotAttributes()]);
      setClan(clanRes);
      setHasClan(mine.clan !== null);
      setMyClan(mine.clan);
      setMyProfile(profile);
      setMyAttributes(attributes);
      setMyWarStatus(mine.clan ? (await getClanWarStatus()).war : null);
    } catch {
      setError(t('clans.loadError'));
    }
  }

  async function handleDeclareWar() {
    setError(null);
    try {
      await declareClanWar(clanId);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_AT_WAR') {
        setError(t('clans.war.errorAlreadyAtWar'));
      } else if (err instanceof ApiError && err.code === 'TARGET_ALREADY_AT_WAR') {
        setError(t('clans.war.errorTargetAlreadyAtWar'));
      } else if (err instanceof ApiError && err.code === 'CLAN_TOO_SMALL') {
        setError(t('clans.war.errorClanTooSmall'));
      } else if (err instanceof ApiError && err.code === 'TARGET_TOO_SMALL') {
        setError(t('clans.war.errorTargetTooSmall'));
      } else if (err instanceof ApiError && err.code === 'REMATCH_COOLDOWN') {
        setError(t('clans.war.errorRematchCooldown'));
      } else {
        setError(t('clans.declareWarError'));
      }
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clanId]);

  async function handleJoin() {
    setError(null);
    if (full) {
      setError(t('clans.errorFull'));
      return;
    }
    if (!eligible) {
      setError(t('clans.errorRequirementsNotMet'));
      return;
    }
    try {
      await joinClan(clanId);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'JOIN_REQUIREMENTS_NOT_MET') {
        setError(t('clans.errorRequirementsNotMet'));
      } else if (err instanceof ApiError && err.code === 'CLAN_FULL') {
        setError(t('clans.errorFull'));
      } else {
        setError(t('clans.joinError'));
      }
    }
  }

  const eligible = clan ? meetsJoinRequirements(clan, myProfile, myAttributes) : false;
  const full = clan ? clan.memberCount >= clan.memberCap : false;

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('clans.title')}</h1>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {clan && (
        <section className="max-w-xl rounded-lg border border-panelBorder bg-panel p-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              [{clan.tag}] {clan.name}
            </h2>
            <span className="text-xs text-textFaint">
              {clan.memberCount}/{clan.memberCap}
            </span>
          </div>
          {clan.description && <p className="mb-4 text-sm text-textMuted">{clan.description}</p>}

          {clan.activeWar &&
            (myWarStatus && myWarStatus.enemyClanId === clan.id ? (
              <Link
                href="/clan-war"
                className="mb-4 flex items-center justify-between rounded-md border border-panelBorderDanger bg-well px-4 py-2.5 text-xs uppercase text-danger hover:bg-accentBgHover"
              >
                <span>{t('clans.war.youAreAtWar')}</span>
                <span className="text-textFaint">{t('clans.war.viewBattle')} →</span>
              </Link>
            ) : (
              <p className="mb-4 rounded-md border border-wellBorder bg-well px-4 py-2.5 text-xs uppercase text-textMuted">
                {t('clans.war.thisClanAtWarWith', { clan: `[${clan.activeWar.opponentClanTag}] ${clan.activeWar.opponentClanName}` })}
              </p>
            ))}

          {hasAnyRequirement(clan.joinRequirements) && (
            <div className="mb-4 flex flex-wrap gap-1.5">
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

          {hasClan === false && (
            <button
              type="button"
              aria-disabled={full || !eligible}
              onClick={handleJoin}
              className="mb-4 w-full rounded-md border border-accent bg-accentBg py-2 text-[11px] uppercase hover:bg-accentBgHover aria-disabled:cursor-not-allowed aria-disabled:opacity-30"
            >
              {t('clans.join')}
            </button>
          )}

          {myClan && !clan.myRole && (myClan.myRole === 'LEADER' || myClan.myRole === 'OFFICER') && (
            <button
              type="button"
              aria-disabled={!!myWarStatus}
              onClick={() => {
                if (myWarStatus) {
                  setError(t('clans.war.errorAlreadyAtWarWith', { clan: `[${myWarStatus.enemyClanTag}] ${myWarStatus.enemyClanName}` }));
                  return;
                }
                setDeclareWarConfirmOpen(true);
              }}
              className="mb-4 w-full rounded-md border border-panelBorderDanger bg-well py-2 text-[11px] uppercase text-danger hover:bg-accentBgHover aria-disabled:cursor-not-allowed aria-disabled:opacity-30"
            >
              {t('clans.war.declareWar')}
            </button>
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

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {clan.buildings.map((building) => (
              <div key={building.key} className="rounded-md border border-wellBorder bg-well p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold">{t(building.nameKey)}</span>
                  <span className="text-[9px] uppercase text-textFaint">
                    {t('clans.buildingLevel')} {building.level}/{building.maxLevel}
                  </span>
                </div>
                <p className="text-[10px] text-textMuted">{t(building.descriptionKey)}</p>
              </div>
            ))}
          </div>

          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-textFaint">
                <th className="pb-2">{t('clans.member')}</th>
                <th className="pb-2">{t('clans.level')}</th>
                <th className="pb-2">{t('clans.role')}</th>
              </tr>
            </thead>
            <tbody>
              {clan.members.map((member) => (
                <tr key={member.playerId} className="border-t border-wellBorder">
                  <td className="py-2">
                    <PlayerLink playerId={member.playerId} username={member.username} />
                  </td>
                  <td className="py-2">{member.level}</td>
                  <td className="py-2">{t(`clans.roleLabel.${member.role}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {clan.myRole && (
            <Link href="/clans" className="mt-4 inline-block text-xs text-accent underline">
              {t('clans.manage')}
            </Link>
          )}
        </section>
      )}
    </GameLayout>
  );
}
