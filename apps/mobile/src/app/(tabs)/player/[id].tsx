import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { FriendshipStatusDto, PlayerPublicProfileDto } from '@pentilius/shared';
import { AssetImage } from '@/components/AssetImage';
import { ConfirmButton } from '@/components/ConfirmButton';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import { ReportSheet } from '@/components/ReportSheet';
import {
  acceptFriendRequest,
  ApiError,
  blockPlayer,
  declineFriendRequest,
  getBlockStatus,
  getFriendshipStatus,
  getPublicProfile,
  removeFriend,
  sendFriendRequest,
  unblockPlayer,
  updateBio,
} from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { getLocale, t } from '@/lib/i18n';
import { displayPlayerName } from '@/lib/player-name';
import { useSession } from '@/lib/session';
import { useLive } from '@/lib/use-live';
import { colors } from '@/theme';

// The web's player profile (apps/web/src/app/(player)/[locale]/players/[id]/page.tsx), as on a phone.
export default function PlayerProfileScreen() {
  const { id: playerId } = useLocalSearchParams<{ id: string }>();
  const { profile: me } = useSession();
  const [profile, setProfile] = useState<PlayerPublicProfileDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bioDraft, setBioDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [friendship, setFriendship] = useState<FriendshipStatusDto | null>(null);
  const [friendActionError, setFriendActionError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const isOwn = !!me && me.id === playerId;

  async function load() {
    if (!playerId) return;
    try {
      const publicProfile = await getPublicProfile(playerId);
      setProfile(publicProfile);
      setBioDraft(publicProfile.bio ?? '');
      if (me && me.id !== playerId) {
        const [friendshipStatus, blockStatus] = await Promise.all([getFriendshipStatus(playerId), getBlockStatus(playerId)]);
        setFriendship(friendshipStatus);
        setBlocked(blockStatus.blocked);
      }
    } catch {
      setError(t('profile.loadError'));
    }
  }
  useLive(load);

  async function friendAction(action: () => Promise<void>, errorKey = 'profile.friendActionError') {
    setFriendActionError(null);
    try {
      await action();
      await load();
    } catch {
      setFriendActionError(t(errorKey));
    }
  }

  async function saveBio() {
    setError(null);
    try {
      setProfile(await updateBio(bioDraft));
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'INAPPROPRIATE_CONTENT' ? t('common.inappropriateContent') : t('profile.saveError'));
    }
  }

  // Another profile opened in the same screen: show nothing stale until it loads.
  const shown = profile && profile.id === playerId ? profile : null;

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.text, marginBottom: 24 }}>{t('profile.title')}</Text>
      {error && <Text style={{ marginBottom: 16, color: '#f87171' }}>{error}</Text>}

      {shown && (
        <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <PlayerAvatarFrame avatarKey={shown.selectedAvatarKey} frameKey={shown.selectedFrameKey} size={56} />
              <Text style={{ flex: 1, fontSize: 20, fontWeight: '600', color: shown.isVip ? colors.vipGold : colors.text }}>{displayPlayerName(shown.username)}</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.textFaint }}>
              {t('dashboard.level')} {shown.level}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AssetImage assetId={`races.${shown.race.toLowerCase()}.icon`} size={16} label="" hideFallback />
              <Text style={{ fontSize: 12, color: colors.textMuted }}>{t(`race.${shown.race}.name`)}</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>
              {shown.clan ? `${t('profile.clan')}: [${shown.clan.tag}] ${shown.clan.name} · ${t(`clans.roleLabel.${shown.clan.role}`)}` : t('profile.noClan')}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>
              {t('profile.memberSince')}: {new Date(shown.createdAt).toLocaleDateString(getLocale() === 'bg' ? 'bg-BG' : 'en-GB')}
            </Text>
          </View>

          {!isOwn && blocked && <Text style={{ marginBottom: 12, fontSize: 12, color: colors.danger }}>{t('moderation.youBlockedThisPlayer')}</Text>}

          {!isOwn && friendship && !blocked && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              {friendship.status === 'NONE' && <SmallButton accent label={t('profile.addFriend')} onPress={() => friendAction(() => sendFriendRequest(playerId))} />}
              {friendship.status === 'PENDING_SENT' && friendship.requestId && (
                <>
                  <Text style={{ fontSize: 12, color: colors.textFaint }}>{t('profile.friendRequestSent')}</Text>
                  <SmallButton label={t('profile.cancelFriendRequest')} onPress={() => friendAction(() => declineFriendRequest(friendship.requestId!))} />
                </>
              )}
              {friendship.status === 'PENDING_RECEIVED' && friendship.requestId && (
                <>
                  <SmallButton accent label={t('profile.acceptFriendRequest')} onPress={() => friendAction(() => acceptFriendRequest(friendship.requestId!))} />
                  <SmallButton label={t('profile.declineFriendRequest')} onPress={() => friendAction(() => declineFriendRequest(friendship.requestId!))} />
                </>
              )}
              {friendship.status === 'FRIENDS' && (
                <>
                  <SmallButton accent label={t('profile.sendMessage')} onPress={() => router.navigate({ pathname: '/friend/[id]', params: { id: playerId } })} />
                  <ConfirmButton label={t('profile.removeFriend')} tone="plain" size="sm" onConfirm={() => friendAction(() => removeFriend(playerId))} />
                </>
              )}
            </View>
          )}
          {friendActionError && <Text style={{ marginBottom: 16, fontSize: 12, color: colors.danger }}>{friendActionError}</Text>}

          {/* Block / report — an app-store requirement for player content. */}
          {!isOwn && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              {blocked ? (
                <SmallButton label={t('moderation.unblock')} onPress={() => friendAction(() => unblockPlayer(playerId), 'moderation.blockError')} />
              ) : (
                <ConfirmButton label={t('moderation.block')} tone="plain" size="sm" confirmLabel={t('moderation.confirmBlock')} onConfirm={() => friendAction(() => blockPlayer(playerId), 'moderation.blockError')} />
              )}
              <SmallButton label={t('moderation.report')} onPress={() => setReportOpen(true)} />
              <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} targetType="PLAYER" targetId={playerId} title={t('moderation.reportPlayerTitle', { name: shown.username })} />
            </View>
          )}

          {/* Past seasons, newest first. */}
          {shown.seasonHistory.length > 0 && (
            <View style={[well, { marginBottom: 16, gap: 6 }]}>
              <SectionTitle>{t('profile.seasonHistory')}</SectionTitle>
              {shown.seasonHistory.map((entry) => (
                <Text key={entry.seasonId} style={{ fontSize: 12, color: colors.textMuted }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>{t('profile.seasonLabel', { season: entry.seasonId })}</Text>
                  {' · '}
                  {t(`race.${entry.race}.name`)}
                  {entry.clanTag
                    ? ` · ${
                        entry.clanRank
                          ? t('profile.seasonClanRank', { rank: entry.clanRank, clan: `[${entry.clanTag}] ${entry.clanName}` })
                          : t('profile.seasonClan', { clan: `[${entry.clanTag}] ${entry.clanName}` })
                      }${entry.clanRole ? ` (${t(`clans.roleLabel.${entry.clanRole}`)})` : ''}`
                    : ''}
                  {' · '}
                  {t('profile.seasonLevel', { level: entry.level })}
                  {' · '}
                  {entry.coreDamageRank ? t('profile.seasonCoreRank', { damage: formatNumber(entry.coreDamage), rank: entry.coreDamageRank }) : t('profile.seasonCoreNone')}
                </Text>
              ))}
            </View>
          )}

          <View style={well}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <SectionTitle>{t('profile.bio')}</SectionTitle>
              {isOwn && !editing && (
                <Text onPress={() => setEditing(true)} style={{ fontSize: 10, textTransform: 'uppercase', color: colors.accent, textDecorationLine: 'underline' }}>
                  {t('profile.editBio')}
                </Text>
              )}
            </View>
            {editing ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={bioDraft}
                  onChangeText={setBioDraft}
                  maxLength={280}
                  multiline
                  numberOfLines={4}
                  style={{ minHeight: 90, textAlignVertical: 'top', borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.ink, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colors.text }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <SmallButton accent label={t('profile.save')} onPress={saveBio} />
                  <SmallButton
                    label={t('profile.cancel')}
                    onPress={() => {
                      setEditing(false);
                      setBioDraft(shown.bio ?? '');
                    }}
                  />
                </View>
              </View>
            ) : (
              <Text style={{ fontSize: 14, color: colors.textMuted }}>{shown.bio || t('profile.noBio')}</Text>
            )}
          </View>

          {shown.clan && (
            <Text onPress={() => router.navigate('/clans')} style={{ marginTop: 16, fontSize: 12, color: colors.accent, textDecorationLine: 'underline' }}>
              {t('profile.viewClan')}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const well = { borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, padding: 16 } as const;

function SectionTitle({ children }: { children: string }) {
  return <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>{children}</Text>;
}

function SmallButton({ label, onPress, accent = false }: { label: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ borderRadius: 6, borderWidth: 1, borderColor: accent ? colors.accent : colors.wellBorder, backgroundColor: accent ? colors.accentBg : 'transparent', paddingHorizontal: 16, paddingVertical: 7 }}>
      <Text style={{ fontSize: 11, textTransform: 'uppercase', color: accent ? colors.text : colors.textMuted }}>{label}</Text>
    </Pressable>
  );
}
