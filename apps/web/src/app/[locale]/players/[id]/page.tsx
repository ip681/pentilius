'use client';

import type { PlayerPublicProfileDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GameLayout } from '@/components/GameLayout';
import { Link } from '@/i18n/navigation';
import { getProfile, getPublicProfile, updateBio } from '@/lib/api-client';
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

  async function load() {
    try {
      const [publicProfile, me] = await Promise.all([getPublicProfile(playerId), getProfile()]);
      setProfile(publicProfile);
      setIsOwn(me.id === playerId);
      setBioDraft(publicProfile.bio ?? '');
    } catch {
      setError(t('profile.loadError'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

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
            <h2 className="text-xl font-semibold">{profile.username}</h2>
            <span className="text-xs text-textFaint">{t('dashboard.level')} {profile.level}</span>
          </div>

          <div className="mb-4 flex flex-wrap gap-4 text-xs text-textMuted">
            <span>{t(`race.${profile.race}.name`)}</span>
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
