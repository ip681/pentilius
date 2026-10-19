import { ReactNode, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { FriendDto, FriendRequestDto, FriendRequestsDto } from '@pentilius/shared';
import { AssetImage } from '@/components/AssetImage';
import { ConfirmButton } from '@/components/ConfirmButton';
import { PlayerLink } from '@/components/PlayerLink';
import { ScreenTitle } from '@/components/ScreenTitle';
import { acceptFriendRequest, declineFriendRequest, getFriendRequests, getFriends, removeFriend } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useLive } from '@/lib/use-live';
import { colors } from '@/theme';

// The web's Friends page list (apps/web/src/app/(player)/[locale]/friends/[[...friendId]]/page.tsx);
// on a phone a conversation opens on its own screen, as the web does at phone width.
export default function FriendsScreen() {
  const [friends, setFriends] = useState<FriendDto[] | null>(null);
  const [requests, setRequests] = useState<FriendRequestsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [friendsRes, requestsRes] = await Promise.all([getFriends(), getFriendRequests()]);
      setFriends(friendsRes);
      setRequests(requestsRes);
    } catch {
      setError(t('friends.loadError'));
    }
  }
  // Coming back from a conversation refreshes the unread dots.
  useLive(load);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await load();
    } catch {
      setError(t('friends.actionError'));
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24, gap: 24 }}>
      <View style={{ marginBottom: -24 }}>
        <ScreenTitle title={t('friends.title')} subtitle={t('friends.subtitle')} />
      </View>
      {error && <Text style={{ color: '#f87171' }}>{error}</Text>}

      {requests && requests.incoming.length > 0 && (
        <Section title={`${t('friends.incomingRequests')} (${requests.incoming.length})`}>
          {requests.incoming.map((request, index) => (
            <RequestRow key={request.id} request={request} first={index === 0}>
              <SmallButton label={t('friends.accept')} accent onPress={() => run(() => acceptFriendRequest(request.id))} />
              <SmallButton label={t('friends.decline')} onPress={() => run(() => declineFriendRequest(request.id))} />
            </RequestRow>
          ))}
        </Section>
      )}

      {requests && requests.outgoing.length > 0 && (
        <Section title={`${t('friends.outgoingRequests')} (${requests.outgoing.length})`}>
          {requests.outgoing.map((request, index) => (
            <RequestRow key={request.id} request={request} first={index === 0}>
              <SmallButton label={t('friends.cancel')} onPress={() => run(() => declineFriendRequest(request.id))} />
            </RequestRow>
          ))}
        </Section>
      )}

      <Section title={`${t('friends.friendsList')} ${friends ? `(${friends.length})` : ''}`}>
        {friends?.length === 0 && <Text style={{ padding: 16, fontSize: 12, color: colors.textFaint }}>{t('friends.noFriends')}</Text>}
        {friends?.map((friend, index) => (
          <View key={friend.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.wellBorder, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Pressable onPress={() => router.navigate({ pathname: '/friend/[id]', params: { id: friend.id } })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
              {friend.hasUnread && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger }} />}
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: friend.isVip ? colors.vipGold : colors.text }}>
                {friend.username}
              </Text>
            </Pressable>
            <ConfirmButton label={t('friends.remove')} tone="text" size="sm" onConfirm={() => run(() => removeFriend(friend.id))} />
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel, overflow: 'hidden' }}>
      <Text style={{ borderBottomWidth: 1, borderBottomColor: colors.panelBorder, backgroundColor: colors.panelHeader, paddingHorizontal: 16, paddingVertical: 12, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function RequestRow({ request, first, children }: { request: FriendRequestDto; first: boolean; children: ReactNode }) {
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: colors.wellBorder, paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600' }}>
          <PlayerLink playerId={request.playerId} username={request.username} />
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AssetImage assetId={`races.${request.race.toLowerCase()}.icon`} size={16} label="" hideFallback />
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{t(`race.${request.race}.name`)}</Text>
        </View>
        <Text style={{ fontSize: 12, color: colors.textFaint }}>
          {t('dashboard.level')} {request.level}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>{children}</View>
    </View>
  );
}

function SmallButton({ label, onPress, accent = false }: { label: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ borderRadius: 6, borderWidth: 1, borderColor: accent ? colors.accent : colors.wellBorder, backgroundColor: accent ? colors.accentBg : 'transparent', paddingHorizontal: 12, paddingVertical: 6 }}>
      <Text style={{ fontSize: 10, textTransform: 'uppercase', color: accent ? colors.text : colors.textMuted }}>{label}</Text>
    </Pressable>
  );
}
