'use client';

import type { DirectMessageDto, FriendDto, FriendRequestDto, FriendRequestsDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { ConfirmButton } from '@/components/ConfirmButton';
import { GameLayout } from '@/components/GameLayout';
import { PlayerLink } from '@/components/PlayerLink';
import { Link } from '@/i18n/navigation';
import {
  acceptFriendRequest,
  ApiError,
  declineFriendRequest,
  getConversation,
  getFriendRequests,
  getFriends,
  removeFriend,
  sendDirectMessage,
} from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-datetime';
import { useRequireAuth } from '@/lib/use-require-auth';

function RaceLabel({ race }: { race: FriendDto['race'] }) {
  const t = useTranslations();
  return (
    <span className="flex items-center gap-1.5 text-xs text-textMuted">
      <AssetIcon
        assetId={`races.${race.toLowerCase()}.icon`}
        alt={t(`race.${race}.name`)}
        className="h-4 w-4 object-contain"
        fallback={<div className="h-4 w-4 rounded-sm bg-accent opacity-60" />}
      />
      {t(`race.${race}.name`)}
    </span>
  );
}

function RequestRow({ request, onAction }: { request: FriendRequestDto; onAction: React.ReactNode }) {
  const t = useTranslations();
  return (
    <div className="flex items-center justify-between gap-3 border-t border-wellBorder px-4 py-2.5 first:border-t-0">
      <div className="flex items-center gap-3">
        <PlayerLink playerId={request.playerId} username={request.username} className="text-sm font-semibold hover:text-accent" />
        <RaceLabel race={request.race} />
        <span className="text-xs text-textFaint">
          {t('dashboard.level')} {request.level}
        </span>
      </div>
      <div className="flex shrink-0 gap-2">{onAction}</div>
    </div>
  );
}

export default function FriendsPage() {
  useRequireAuth();
  const t = useTranslations();
  const params = useParams<{ friendId?: string[] }>();
  const selectedFriendId = params.friendId?.[0] ?? null;

  const [friends, setFriends] = useState<FriendDto[] | null>(null);
  const [requests, setRequests] = useState<FriendRequestsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [messages, setMessages] = useState<DirectMessageDto[] | null>(null);
  const [chatText, setChatText] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const chatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const [friendsRes, requestsRes] = await Promise.all([getFriends(), getFriendRequests()]);
      setFriends(friendsRes);
      setRequests(requestsRes);
    } catch {
      setError(t('friends.loadError'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMessages(friendId: string) {
    try {
      setMessages(await getConversation(friendId));
    } catch {
      // Silent — a transient poll miss shouldn't clobber the page's main error banner.
    }
  }

  useEffect(() => {
    if (chatIntervalRef.current) {
      clearInterval(chatIntervalRef.current);
      chatIntervalRef.current = null;
    }
    setChatText('');
    setChatError(null);
    if (!selectedFriendId) {
      setMessages(null);
      return;
    }
    loadMessages(selectedFriendId);
    chatIntervalRef.current = setInterval(() => loadMessages(selectedFriendId), 5000);
    return () => {
      if (chatIntervalRef.current) clearInterval(chatIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFriendId]);

  function friendActionErrorMessage(err: unknown): string {
    if (err instanceof ApiError && err.code === 'SENDING_TOO_FAST') return t('friends.sendingTooFast');
    return t('friends.actionError');
  }

  async function handleAccept(requestId: string) {
    setError(null);
    try {
      await acceptFriendRequest(requestId);
      await load();
    } catch {
      setError(t('friends.actionError'));
    }
  }

  async function handleDecline(requestId: string) {
    setError(null);
    try {
      await declineFriendRequest(requestId);
      await load();
    } catch {
      setError(t('friends.actionError'));
    }
  }

  async function handleRemove(playerId: string) {
    setError(null);
    try {
      await removeFriend(playerId);
      await load();
    } catch {
      setError(t('friends.actionError'));
    }
  }

  async function handleSendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedFriendId || !chatText.trim()) return;
    setChatError(null);
    try {
      await sendDirectMessage(selectedFriendId, chatText.trim());
      setChatText('');
      await loadMessages(selectedFriendId);
    } catch (err) {
      setChatError(friendActionErrorMessage(err));
    }
  }

  const selectedFriend = friends?.find((f) => f.id === selectedFriendId) ?? null;

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('friends.title')}</h1>
        <p className="text-xs text-textMuted">{t('friends.subtitle')}</p>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      <div className={selectedFriendId ? 'hidden md:block' : ''}>
        {requests && requests.incoming.length > 0 && (
          <section className="mb-6 overflow-hidden rounded-lg border border-panelBorder bg-panel">
            <h2 className="border-b border-panelBorder bg-panelHeader px-4 py-3 text-xs font-semibold uppercase tracking-wide text-textFaint">
              {t('friends.incomingRequests')} ({requests.incoming.length})
            </h2>
            {requests.incoming.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                onAction={
                  <>
                    <button
                      type="button"
                      onClick={() => handleAccept(request.id)}
                      className="rounded-md border border-accent bg-accentBg px-3 py-1 text-[10px] uppercase hover:bg-accentBgHover"
                    >
                      {t('friends.accept')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecline(request.id)}
                      className="rounded-md border border-wellBorder px-3 py-1 text-[10px] uppercase text-textMuted hover:text-text"
                    >
                      {t('friends.decline')}
                    </button>
                  </>
                }
              />
            ))}
          </section>
        )}

        {requests && requests.outgoing.length > 0 && (
          <section className="mb-6 overflow-hidden rounded-lg border border-panelBorder bg-panel">
            <h2 className="border-b border-panelBorder bg-panelHeader px-4 py-3 text-xs font-semibold uppercase tracking-wide text-textFaint">
              {t('friends.outgoingRequests')} ({requests.outgoing.length})
            </h2>
            {requests.outgoing.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                onAction={
                  <button
                    type="button"
                    onClick={() => handleDecline(request.id)}
                    className="rounded-md border border-wellBorder px-3 py-1 text-[10px] uppercase text-textMuted hover:text-text"
                  >
                    {t('friends.cancel')}
                  </button>
                }
              />
            ))}
          </section>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr] md:items-start">
        <section className={`overflow-hidden rounded-lg border border-panelBorder bg-panel ${selectedFriendId ? 'hidden md:block' : ''}`}>
          <h2 className="border-b border-panelBorder bg-panelHeader px-4 py-3 text-xs font-semibold uppercase tracking-wide text-textFaint">
            {t('friends.friendsList')} {friends ? `(${friends.length})` : ''}
          </h2>
          {friends?.length === 0 && <p className="p-4 text-xs text-textFaint">{t('friends.noFriends')}</p>}
          {friends?.map((friend) => (
            <div key={friend.id} className="flex items-center justify-between gap-2 border-t border-wellBorder px-4 py-2.5 first:border-t-0">
              <Link
                href={`/friends/${friend.id}`}
                className={`min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent ${friend.id === selectedFriendId ? 'text-accent' : ''}`}
              >
                {friend.username}
              </Link>
              <ConfirmButton
                label={t('friends.remove')}
                confirmLabel={t('common.confirm')}
                cancelLabel={t('common.cancel')}
                onConfirm={() => handleRemove(friend.id)}
                className="shrink-0 text-[10px] uppercase text-textFaint hover:text-danger"
                confirmClassName="rounded-md border border-panelBorderDanger bg-well px-2 py-1 text-[10px] uppercase text-danger hover:bg-accentBgHover"
                cancelClassName="rounded-md border border-panelBorder bg-panel px-2 py-1 text-[10px] uppercase text-textMuted hover:bg-accentBgHover"
                wrapperClassName="shrink-0"
              />
            </div>
          ))}
        </section>

        <section className={`rounded-lg border border-panelBorder bg-panel p-4 ${selectedFriendId ? '' : 'hidden md:flex md:items-center md:justify-center'}`}>
          {selectedFriendId ? (
            <>
              <Link href="/friends" className="mb-3 inline-block text-xs text-accent hover:underline md:hidden">
                ← {t('friends.backToList')}
              </Link>
              <h3 className="mb-2 text-sm font-semibold">{selectedFriend?.username ?? t('friends.conversation')}</h3>
              <div className="mb-2 flex h-[320px] flex-col-reverse overflow-y-auto rounded border border-wellBorder bg-ink p-2.5">
                <div>
                  {messages && messages.length === 0 && <p className="text-[11px] text-textFaint">{t('friends.noMessages')}</p>}
                  {messages?.map((message) => {
                    const fromFriend = message.senderId === selectedFriendId;
                    return (
                      <div key={message.id} className="mb-1.5 text-xs">
                        <span className="text-[9px] text-textFaint">{formatDateTime(message.createdAt)}</span>{' '}
                        <span className={`font-semibold ${fromFriend ? 'text-textMuted' : 'text-accent'}`}>
                          {fromFriend ? selectedFriend?.username : t('friends.you')}
                        </span>
                        {': '}
                        <span className="text-textMuted">{message.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {chatError && <p className="mb-2 text-[11px] text-danger">{chatError}</p>}
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  maxLength={500}
                  placeholder={t('friends.messagePlaceholder')}
                  className="flex-1 rounded-md border border-wellBorder bg-ink px-3 py-2 text-xs text-text outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={!chatText.trim()}
                  className="rounded-md border border-accent bg-accentBg px-4 py-2 text-[11px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {t('friends.send')}
                </button>
              </form>
            </>
          ) : (
            <p className="hidden text-xs text-textFaint md:block">{t('friends.selectToChat')}</p>
          )}
        </section>
      </div>
    </GameLayout>
  );
}
