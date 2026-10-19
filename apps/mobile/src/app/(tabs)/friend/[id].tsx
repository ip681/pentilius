import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { DirectMessageDto, FriendDto } from '@pentilius/shared';
import { MessageActions } from '@/components/MessageActions';
import { ApiError, getConversation, getFriends, sendDirectMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLive } from '@/lib/use-live';
import { colors } from '@/theme';

// One conversation of the web's Friends page, on its own screen as at phone width there.
export default function ConversationScreen() {
  const { id: friendId } = useLocalSearchParams<{ id: string }>();
  const [friend, setFriend] = useState<FriendDto | null>(null);
  const [messages, setMessages] = useState<DirectMessageDto[] | null>(null);
  const [chatText, setChatText] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const currentFriendRef = useRef(friendId);
  currentFriendRef.current = friendId;
  const listRef = useRef<{ scrollToEnd: (options?: { animated?: boolean }) => void } | null>(null);

  useEffect(() => {
    setMessages(null);
    setChatText('');
    setChatError(null);
    getFriends()
      .then((list) => setFriend(list.find((f) => f.id === friendId) ?? null))
      .catch(() => undefined);
  }, [friendId]);

  // Loading the conversation also marks it read on the server.
  async function loadMessages() {
    if (!friendId) return;
    const forFriend = friendId;
    try {
      const list = await getConversation(forFriend);
      // A late answer for a conversation that was left meanwhile is dropped.
      if (currentFriendRef.current === forFriend) setMessages(list);
    } catch {
      // A missed poll shouldn't show an error.
    }
  }
  // The open conversation is live — every 5 s, only while this screen is in view.
  useLive(loadMessages, 5000);

  async function send() {
    if (!friendId || !chatText.trim()) return;
    setChatError(null);
    try {
      await sendDirectMessage(friendId, chatText.trim());
      setChatText('');
      await loadMessages();
    } catch (err) {
      setChatError(err instanceof ApiError && err.code === 'SENDING_TOO_FAST' ? t('friends.sendingTooFast') : t('friends.actionError'));
    }
  }

  const name = friend?.username ?? t('friends.conversation');

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ink }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, padding: 12, gap: 8 }}>
        <Text onPress={() => router.navigate('/friends')} style={{ fontSize: 12, color: colors.accent }}>
          ← {t('friends.backToList')}
        </Text>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{name}</Text>
        <ScrollView
          ref={listRef as never}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          style={{ flex: 1, borderRadius: 4, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.panel }}
          contentContainerStyle={{ padding: 10, gap: 6 }}
        >
          {messages && messages.length === 0 && <Text style={{ fontSize: 11, color: colors.textFaint }}>{t('friends.noMessages')}</Text>}
          {messages?.map((message) => {
              const fromFriend = message.senderId === friendId;
              return (
                <Text key={message.id} style={{ fontSize: 12, color: colors.textMuted }}>
                  <Text style={{ fontSize: 9, color: colors.textFaint }}>{formatDateTime(message.createdAt)}</Text>{' '}
                  <Text style={{ fontWeight: '600', color: fromFriend ? (friend?.isVip ? colors.vipGold : colors.textMuted) : colors.accent }}>{fromFriend ? friend?.username : t('friends.you')}</Text>
                  {': '}
                  {message.text}
                  {fromFriend && (
                    <MessageActions
                      messageId={message.id}
                      targetType="DIRECT_MESSAGE"
                      authorId={friendId}
                      authorName={friend?.username ?? ''}
                      allowBlock
                      // Blocking ends the friendship, so this conversation is gone — back to the list.
                      onBlocked={() => router.navigate('/friends')}
                    />
                  )}
                </Text>
              );
            })}
        </ScrollView>
        {chatError && <Text style={{ fontSize: 11, color: colors.danger }}>{chatError}</Text>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={chatText}
            onChangeText={setChatText}
            maxLength={500}
            placeholder={t('friends.messagePlaceholder')}
            placeholderTextColor={colors.textFaint}
            onSubmitEditing={send}
            returnKeyType="send"
            style={{ flex: 1, borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.panel, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: colors.text }}
          />
          <Pressable
            disabled={!chatText.trim()}
            onPress={send}
            style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentBg, paddingHorizontal: 16, justifyContent: 'center', opacity: chatText.trim() ? 1 : 0.3 }}
          >
            <Text style={{ fontSize: 11, textTransform: 'uppercase', color: colors.text }}>{t('friends.send')}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
