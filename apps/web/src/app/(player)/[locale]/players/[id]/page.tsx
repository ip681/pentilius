'use client';

import type { FriendshipStatusDto, PlayerPublicProfileDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { ConfirmButton } from '@/components/ConfirmButton';
import { GameLayout } from '@/components/GameLayout';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import { Link } from '@/i18n/navigation';
import {
  acceptFriendRequest,
  declineFriendRequest,
  getFriendshipStatus,
  getProfile,
  getPublicProfile,
  removeFriend,
  sendFriendRequest,
  updateBio,
} from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function PlayerProfilePage() {
  useRequireAuth();
  const t = useTranslations();
  const params = useParams<{ id: string }>();
  const playerId = params.id;

  const [profile, setProfile] = useState<PlayerPublicProfileDto | null>(null);
  const [isOwn, setIsOwn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bioDraft, setBioDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [friendship, setFriendship] = useState<FriendshipStatusDto | null>(null);
  const [friendActionError, setFriendActionError] = useState<string | null>(null);

  async function load() {
    try {
      const [publicProfile, me] = await Promise.all([getPublicProfile(playerId), getProfile()]);
      setProfile(publicProfile);
      setIsOwn(me.id === playerId);
      setBioDraft(publicProfile.bio ?? '');
      if (me.id !== playerId) {
        setFriendship(await getFriendshipStatus(playerId));
      }
    } catch {
      setError(t('profile.loadError'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  async function handleSendFriendRequest() {
    setFriendActionError(null);
    try {
      await sendFriendRequest(playerId);
      await load();
    } catch {
      setFriendActionError(t('profile.friendActionError'));
    }
  }

  async function handleAcceptFriendRequest(requestId: string) {
    setFriendActionError(null);
    try {
      await acceptFriendRequest(requestId);
      await load();
    } catch {
      setFriendActionError(t('profile.friendActionError'));
    }
  }

  async function handleDeclineOrCancelRequest(requestId: string) {
    setFriendActionError(null);
    try {
      await declineFriendRequest(requestId);
      await load();
    } catch {
      setFriendActionError(t('profile.friendActionError'));
    }
  }

  async function handleRemoveFriend() {
    setFriendActionError(null);
    try {
      await removeFriend(playerId);
      await load();
    } catch {
      setFriendActionError(t('profile.friendActionError'));
    }
  }

  async function handleSaveBio(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const updated = await updateBio(bioDraft);
      setProfile(updated);
      setEditing(false);
    } catch {
      setError(t('profile.saveError'));
    }
  }

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('profile.title')}</h1>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {profile && (
        <section className="max-w-xl rounded-lg border border-panelBorder bg-panel p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PlayerAvatarFrame avatarKey={profile.selectedAvatarKey} frameKey={profile.selectedFrameKey} className="h-14 w-14 shrink-0" />
              <h2 className="text-xl font-semibold">{profile.username}</h2>
            </div>
            <span className="text-xs text-textFaint">{t('dashboard.level')} {profile.level}</span>
          </div>

          <div className="mb-4 flex flex-wrap gap-4 text-xs text-textMuted">
            <span className="flex items-center gap-1.5">
              <AssetIcon
                assetId={`races.${profile.race.toLowerCase()}.icon`}
                alt={t(`race.${profile.race}.name`)}
                className="h-4 w-4 object-contain"
                fallback={<div className="h-4 w-4 rounded-sm bg-accent opacity-60" />}
              />
              {t(`race.${profile.race}.name`)}
            </span>
            <span>
              {profile.clan ? (
                <>
                  {t('profile.clan')}: [{profile.clan.tag}] {profile.clan.name} · {t(`clans.roleLabel.${profile.clan.role}`)}
                </>
              ) : (
                t('profile.noClan')
              )}
            </span>
            <span>{t('profile.memberSince')}: {new Date(profile.createdAt).toLocaleDateString()}</span>
          </div>

          {!isOwn && friendship && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {friendship.status === 'NONE' && (
                <button
                  type="button"
                  onClick={handleSendFriendRequest}
                  className="rounded-md border border-accent bg-accentBg px-4 py-1.5 text-[11px] uppercase hover:bg-accentBgHover"
                >
                  {t('profile.addFriend')}
                </button>
              )}
              {friendship.status === 'PENDING_SENT' && friendship.requestId && (
                <>
                  <span className="text-xs text-textFaint">{t('profile.friendRequestSent')}</span>
                  <button
                    type="button"
                    onClick={() => handleDeclineOrCancelRequest(friendship.requestId!)}
                    className="rounded-md border border-wellBorder px-4 py-1.5 text-[11px] uppercase text-textMuted hover:text-text"
                  >
                    {t('profile.cancelFriendRequest')}
                  </button>
                </>
              )}
              {friendship.status === 'PENDING_RECEIVED' && friendship.requestId && (
                <>
                  <button
                    type="button"
                    onClick={() => handleAcceptFriendRequest(friendship.requestId!)}
                    className="rounded-md border border-accent bg-accentBg px-4 py-1.5 text-[11px] uppercase hover:bg-accentBgHover"
                  >
                    {t('profile.acceptFriendRequest')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeclineOrCancelRequest(friendship.requestId!)}
                    className="rounded-md border border-wellBorder px-4 py-1.5 text-[11px] uppercase text-textMuted hover:text-text"
                  >
                    {t('profile.declineFriendRequest')}
                  </button>
                </>
              )}
              {friendship.status === 'FRIENDS' && (
                <>
                  <Link
                    href={`/friends/${playerId}`}
                    className="rounded-md border border-accent bg-accentBg px-4 py-1.5 text-[11px] uppercase hover:bg-accentBgHover"
                  >
                    {t('profile.sendMessage')}
                  </Link>
                  <ConfirmButton
                    label={t('profile.removeFriend')}
                    confirmLabel={t('common.confirm')}
                    cancelLabel={t('common.cancel')}
                    onConfirm={handleRemoveFriend}
                    className="rounded-md border border-wellBorder px-4 py-1.5 text-[11px] uppercase text-textMuted hover:text-danger"
                    confirmClassName="rounded-md border border-panelBorderDanger bg-well px-4 py-1.5 text-[11px] uppercase text-danger hover:bg-accentBgHover"
                    cancelClassName="rounded-md border border-wellBorder px-4 py-1.5 text-[11px] uppercase text-textMuted hover:text-text"
                  />
                </>
              )}
            </div>
          )}
          {friendActionError && <p className="mb-4 text-xs text-danger">{friendActionError}</p>}

          <div className="rounded-md border border-wellBorder bg-well p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-textFaint">{t('profile.bio')}</h3>
              {isOwn && !editing && (
                <button type="button" onClick={() => setEditing(true)} className="text-[10px] uppercase text-accent underline">
                  {t('profile.editBio')}
                </button>
              )}
            </div>

            {editing ? (
              <form onSubmit={handleSaveBio} className="flex flex-col gap-2">
                <textarea
                  maxLength={280}
                  rows={4}
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  className="rounded-md border border-wellBorder bg-ink px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
                <div className="flex gap-2">
                  <button type="submit" className="rounded-md border border-accent bg-accentBg px-4 py-1.5 text-[11px] uppercase hover:bg-accentBgHover">
                    {t('profile.save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setBioDraft(profile.bio ?? '');
                    }}
                    className="rounded-md border border-wellBorder px-4 py-1.5 text-[11px] uppercase text-textMuted hover:text-text"
                  >
                    {t('profile.cancel')}
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-textMuted">{profile.bio || t('profile.noBio')}</p>
            )}
          </div>

          {profile.clan && (
            <Link href="/clans" className="mt-4 inline-block text-xs text-accent underline">
              {t('profile.viewClan')}
            </Link>
          )}
        </section>
      )}
    </GameLayout>
  );
}
