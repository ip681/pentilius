import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ClanDetailDto, ClanWarStateDto, RobotAttributesDto } from '@pentilius/shared';
import { AssetImage } from '@/components/AssetImage';
import { JoinRequirementChips, meetsJoinRequirements } from '@/components/JoinRequirements';
import { PlayerLink } from '@/components/PlayerLink';
import { ReportSheet } from '@/components/ReportSheet';
import { SheetButtons } from '@/components/SheetButtons';
import { Sheet } from '@/components/ui';
import { ApiError, declareClanWar, getClan, getClanWarStatus, getMyClan, getRobotAttributes, joinClan } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useLive } from '@/lib/use-live';
import { colors } from '@/theme';

// The web's public clan page (apps/web/src/app/(player)/[locale]/clans/[id]/page.tsx), as on a phone.
export default function ClanDetailScreen() {
  const { id: clanId } = useLocalSearchParams<{ id: string }>();
  const { profile } = useSession();
  const [clan, setClan] = useState<ClanDetailDto | null>(null);
  const [myClan, setMyClan] = useState<ClanDetailDto | null | undefined>(undefined);
  const [myWarStatus, setMyWarStatus] = useState<ClanWarStateDto | null>(null);
  const [myAttributes, setMyAttributes] = useState<RobotAttributesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declareWarOpen, setDeclareWarOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  async function load() {
    if (!clanId) return;
    try {
      const [clanRes, mine, attributes] = await Promise.all([getClan(clanId), getMyClan(), getRobotAttributes()]);
      setClan(clanRes);
      setMyClan(mine.clan);
      setMyAttributes(attributes);
      setMyWarStatus(mine.clan ? (await getClanWarStatus()).war : null);
    } catch {
      setError(t('clans.loadError'));
    }
  }
  useLive(load);

  const eligible = clan ? meetsJoinRequirements(clan, profile, myAttributes) : false;
  const full = clan ? clan.memberCount >= clan.memberCap : false;

  async function handleJoin() {
    setError(null);
    if (full) return setError(t('clans.errorFull'));
    if (!eligible) return setError(t('clans.errorRequirementsNotMet'));
    try {
      await joinClan(clanId);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'JOIN_REQUIREMENTS_NOT_MET') setError(t('clans.errorRequirementsNotMet'));
      else if (err instanceof ApiError && err.code === 'CLAN_FULL') setError(t('clans.errorFull'));
      else setError(t('clans.joinError'));
    }
  }

  async function handleDeclareWar() {
    setError(null);
    try {
      await declareClanWar(clanId);
      await load();
    } catch (err) {
      const map: Record<string, string> = {
        ALREADY_AT_WAR: t('clans.war.errorAlreadyAtWar'),
        TARGET_ALREADY_AT_WAR: t('clans.war.errorTargetAlreadyAtWar'),
        CLAN_TOO_SMALL: t('clans.war.errorClanTooSmall'),
        TARGET_TOO_SMALL: t('clans.war.errorTargetTooSmall'),
        REMATCH_COOLDOWN: t('clans.war.errorRematchCooldown'),
      };
      setError(err instanceof ApiError && err.code && map[err.code] ? map[err.code] : t('clans.declareWarError'));
    }
  }

  // Another clan opened in the same screen: show nothing stale until it loads.
  const shown = clan && clan.id === clanId ? clan : null;

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.text, marginBottom: 24 }}>{t('clans.title')}</Text>
      {error && <Text style={{ marginBottom: 16, color: '#f87171' }}>{error}</Text>}

      {shown && (
        <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel, padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: '600', color: colors.text }}>
              [{shown.tag}] {shown.name}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textFaint }}>
              {shown.memberCount}/{shown.memberCap}
            </Text>
          </View>
          {shown.description ? <Text style={{ marginBottom: 16, fontSize: 14, color: colors.textMuted }}>{shown.description}</Text> : null}

          {shown.activeWar &&
            (myWarStatus && myWarStatus.enemyClanId === shown.id ? (
              <Pressable
                onPress={() => router.navigate('/clan-war')}
                style={{ marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', gap: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.panelBorderDanger, backgroundColor: colors.well, paddingHorizontal: 16, paddingVertical: 10 }}
              >
                <Text style={{ fontSize: 12, textTransform: 'uppercase', color: colors.danger }}>{t('clans.war.youAreAtWar')}</Text>
                <Text style={{ fontSize: 12, textTransform: 'uppercase', color: colors.textFaint }}>{t('clans.war.viewBattle')} →</Text>
              </Pressable>
            ) : (
              <Text style={{ marginBottom: 16, borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, paddingHorizontal: 16, paddingVertical: 10, fontSize: 12, textTransform: 'uppercase', color: colors.textMuted }}>
                {t('clans.war.thisClanAtWarWith', { clan: `[${shown.activeWar.opponentClanTag}] ${shown.activeWar.opponentClanName}` })}
              </Text>
            ))}

          <JoinRequirementChips requirements={shown.joinRequirements} />

          {myClan === null && (
            <Pressable onPress={handleJoin} style={{ marginBottom: 16, borderRadius: 6, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentBg, paddingVertical: 9, alignItems: 'center', opacity: full || !eligible ? 0.3 : 1 }}>
              <Text style={{ fontSize: 11, textTransform: 'uppercase', color: colors.text }}>{t('clans.join')}</Text>
            </Pressable>
          )}

          {myClan && !shown.myRole && (myClan.myRole === 'LEADER' || myClan.myRole === 'OFFICER') && (
            <Pressable
              onPress={() => {
                if (myWarStatus) {
                  setError(t('clans.war.errorAlreadyAtWarWith', { clan: `[${myWarStatus.enemyClanTag}] ${myWarStatus.enemyClanName}` }));
                  return;
                }
                setDeclareWarOpen(true);
              }}
              style={{ marginBottom: 16, borderRadius: 6, borderWidth: 1, borderColor: colors.panelBorderDanger, backgroundColor: colors.well, paddingVertical: 9, alignItems: 'center', opacity: myWarStatus ? 0.3 : 1 }}
            >
              <Text style={{ fontSize: 11, textTransform: 'uppercase', color: colors.danger }}>{t('clans.war.declareWar')}</Text>
            </Pressable>
          )}

          <Sheet open={declareWarOpen} onClose={() => setDeclareWarOpen(false)}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>{t('clans.war.confirmDeclareWar')}</Text>
            <SheetButtons
              danger
              onConfirm={() => {
                setDeclareWarOpen(false);
                handleDeclareWar();
              }}
              onCancel={() => setDeclareWarOpen(false)}
            />
          </Sheet>

          {/* The same tiles as your own clan, read-only. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {shown.buildings.map((building) => (
              <View key={building.key} style={{ width: '31.5%', alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, padding: 8 }}>
                <View style={{ width: 72, height: 72, marginBottom: 6, alignItems: 'center', justifyContent: 'center' }}>
                  <AssetImage assetId={`clanBuildings.${building.key}.icon`} size={72} label={t(building.nameKey)} dimmed={building.level === 0} />
                </View>
                <Text style={{ fontSize: 11, fontWeight: '600', textAlign: 'center', color: colors.text }}>
                  {t(building.nameKey)} <Text style={{ color: colors.textMuted }}>({building.level})</Text>
                </Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', paddingBottom: 8 }}>
            <Text style={{ flex: 1, fontSize: 10, textTransform: 'uppercase', color: colors.textFaint }}>{t('clans.member')}</Text>
            <Text style={{ width: 60, fontSize: 10, textTransform: 'uppercase', color: colors.textFaint }}>{t('clans.level')}</Text>
            <Text style={{ width: 90, fontSize: 10, textTransform: 'uppercase', color: colors.textFaint }}>{t('clans.role')}</Text>
          </View>
          {shown.members.map((member) => (
            <View key={member.playerId} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.wellBorder, paddingVertical: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 12 }}>
                <PlayerLink playerId={member.playerId} username={member.username} isVip={member.isVip} />
              </Text>
              <Text style={{ width: 60, fontSize: 12, color: colors.text }}>{member.level}</Text>
              <Text style={{ width: 90, fontSize: 12, color: colors.text }}>{t(`clans.roleLabel.${member.role}`)}</Text>
            </View>
          ))}

          {shown.myRole && (
            <Text onPress={() => router.navigate('/clans')} style={{ marginTop: 16, fontSize: 12, color: colors.accent, textDecorationLine: 'underline' }}>
              {t('clans.manage')}
            </Text>
          )}

          {/* Report the clan's name/description — not offered for your own clan. */}
          {!shown.myRole && (
            <>
              <Text onPress={() => setReportOpen(true)} style={{ marginTop: 16, fontSize: 11, textTransform: 'uppercase', color: colors.textFaint, textDecorationLine: 'underline' }}>
                {t('moderation.reportClan')}
              </Text>
              <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} targetType="CLAN" targetId={shown.id} title={t('moderation.reportClanTitle', { name: `[${shown.tag}] ${shown.name}` })} />
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}
