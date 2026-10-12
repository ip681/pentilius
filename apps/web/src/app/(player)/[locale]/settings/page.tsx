'use client';

import type { AccountDeletionStatusDto, BlockedPlayerDto, CosmeticsCatalogDto } from '@pentilius/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { GameLayout } from '@/components/GameLayout';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import { PlayerLink } from '@/components/PlayerLink';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  ApiError,
  cancelAccountDeletion,
  changePassword,
  getAccountDeletionCode,
  getAccountDeletionStatus,
  getBlockedPlayers,
  getCosmeticsCatalog,
  getProfile,
  requestAccountDeletion,
  unblockPlayer,
  updateAvatar,
  updateFrame,
  updatePreferredLocale,
} from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-datetime';
import { notifyProfileChanged } from '@/lib/profile-events';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function SettingsPage() {
  useRequireAuth();
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [selectedLocale, setSelectedLocale] = useState(locale);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [languageSuccess, setLanguageSuccess] = useState(false);

  const [cosmetics, setCosmetics] = useState<CosmeticsCatalogDto | null>(null);
  const [selectedAvatarKey, setSelectedAvatarKey] = useState<string | null>(null);
  const [selectedFrameKey, setSelectedFrameKey] = useState<string | null>(null);
  const [cosmeticsError, setCosmeticsError] = useState<string | null>(null);

  useEffect(() => {
    getProfile()
      .then((data) => {
        setSelectedLocale(data.preferredLocale ?? locale);
        setSelectedAvatarKey(data.selectedAvatarKey);
        setSelectedFrameKey(data.selectedFrameKey);
      })
      .catch(() => undefined);
    getCosmeticsCatalog()
      .then(setCosmetics)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelectAvatar(key: string) {
    setCosmeticsError(null);
    const previous = selectedAvatarKey;
    setSelectedAvatarKey(key);
    try {
      await updateAvatar(key);
      notifyProfileChanged();
    } catch {
      setSelectedAvatarKey(previous);
      setCosmeticsError(t('settings.cosmeticsError'));
    }
  }

  async function handleSelectFrame(key: string) {
    setCosmeticsError(null);
    const previous = selectedFrameKey;
    setSelectedFrameKey(key);
    try {
      await updateFrame(key);
      notifyProfileChanged();
    } catch {
      setSelectedFrameKey(previous);
      setCosmeticsError(t('settings.cosmeticsError'));
    }
  }

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.passwordMismatch'));
      return;
    }
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
    } catch (err) {
      setPasswordError(
        err instanceof ApiError && err.code === 'INCORRECT_CURRENT_PASSWORD' ? t('settings.incorrectCurrentPassword') : t('settings.passwordError'),
      );
    }
  }

  async function handleSaveLanguage(event: React.FormEvent) {
    event.preventDefault();
    setLanguageError(null);
    setLanguageSuccess(false);
    try {
      await updatePreferredLocale(selectedLocale);
      notifyProfileChanged();
      setLanguageSuccess(true);
      router.replace(pathname, { locale: selectedLocale });
    } catch {
      setLanguageError(t('settings.languageError'));
    }
  }

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
        <p className="text-xs text-textMuted">{t('settings.subtitle')}</p>
      </div>

      {/* Two columns on wide screens; the danger zone spans both at the bottom. */}
      <div className="grid max-w-6xl gap-5 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-5">
          <section className="rounded-lg border border-panelBorder bg-panel p-5">
            <h2 className="mb-3 text-sm font-semibold">{t('settings.passwordSection')}</h2>
            <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-xs text-textMuted">
                {t('settings.currentPassword')}
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-textMuted">
                {t('settings.newPassword')}
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-textMuted">
                {t('settings.confirmPassword')}
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              {passwordError && <p className="text-xs text-danger">{passwordError}</p>}
              {passwordSuccess && <p className="text-xs text-positive">{t('settings.passwordSaved')}</p>}
              <button
                type="submit"
                className="self-start rounded-md border border-accent bg-accentBg px-5 py-2 text-xs uppercase hover:bg-accentBgHover"
              >
                {t('settings.save')}
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-panelBorder bg-panel p-5">
            <h2 className="mb-3 text-sm font-semibold">{t('settings.languageSection')}</h2>
            <form onSubmit={handleSaveLanguage} className="flex flex-col gap-3">
              <select
                value={selectedLocale}
                onChange={(e) => setSelectedLocale(e.target.value)}
                className="w-40 rounded-md border border-wellBorder bg-well px-3 py-2 text-sm text-text outline-none focus:border-accent"
              >
                <option value="en">EN</option>
                <option value="bg">BG</option>
              </select>
              {languageError && <p className="text-xs text-danger">{languageError}</p>}
              {languageSuccess && <p className="text-xs text-positive">{t('settings.languageSaved')}</p>}
              <button
                type="submit"
                className="self-start rounded-md border border-accent bg-accentBg px-5 py-2 text-xs uppercase hover:bg-accentBgHover"
              >
                {t('settings.save')}
              </button>
            </form>
          </section>
        </div>
        <div className="flex flex-col gap-5">
          <section className="rounded-lg border border-panelBorder bg-panel p-5">
            <h2 className="mb-3 text-sm font-semibold">{t('settings.cosmeticsSection')}</h2>
            <div className="mb-4 flex justify-center">
              <PlayerAvatarFrame avatarKey={selectedAvatarKey} frameKey={selectedFrameKey} className="h-24 w-24" />
            </div>

            <div className="mb-1 text-[10px] uppercase tracking-wide text-textFaint">{t('settings.avatar')}</div>
            <div className="mb-4 grid grid-cols-6 gap-2">
              {cosmetics?.avatars.map((avatar) => (
                <button
                  key={avatar.key}
                  type="button"
                  title={t(avatar.nameKey)}
                  onClick={() => handleSelectAvatar(avatar.key)}
                  className={`flex aspect-square items-center justify-center rounded-full border-2 bg-well ${
                    selectedAvatarKey === avatar.key ? 'border-accent' : 'border-wellBorder'
                  }`}
                >
                  <AssetIcon
                    assetId={avatar.iconAssetId}
                    alt={t(avatar.nameKey)}
                    className="h-full w-full rounded-full object-contain p-1"
                    fallback={<span className="text-[9px] font-semibold text-textMuted">{avatar.key.replace(/\D/g, '')}</span>}
                  />
                </button>
              ))}
            </div>

            <div className="mb-1 text-[10px] uppercase tracking-wide text-textFaint">{t('settings.frame')}</div>
            <div className="grid grid-cols-6 gap-2">
              {cosmetics?.frames.map((frame) => (
                <button
                  key={frame.key}
                  type="button"
                  title={t(frame.nameKey)}
                  onClick={() => handleSelectFrame(frame.key)}
                  className={`flex aspect-square items-center justify-center rounded-full border-2 bg-well ${
                    selectedFrameKey === frame.key ? 'border-accent' : 'border-wellBorder'
                  }`}
                >
                  <AssetIcon
                    assetId={frame.iconAssetId}
                    alt={t(frame.nameKey)}
                    className="h-full w-full rounded-full object-contain p-1"
                    fallback={<span className="text-[9px] font-semibold text-textMuted">{frame.key.replace(/\D/g, '')}</span>}
                  />
                </button>
              ))}
            </div>
            {cosmeticsError && <p className="mt-3 text-xs text-danger">{cosmeticsError}</p>}
          </section>

          <BlockedPlayersSection />
        </div>
        <div className="lg:col-span-2">
          <DeleteAccountSection />
        </div>
      </div>
    </GameLayout>
  );
}

/** Players you've blocked (owner decision, 2026-10-12), with unblock. */
function BlockedPlayersSection() {
  const t = useTranslations();
  const [blocked, setBlocked] = useState<BlockedPlayerDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setBlocked(await getBlockedPlayers());
    } catch {
      setError(t('moderation.blockedLoadError'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUnblock(playerId: string) {
    setError(null);
    try {
      await unblockPlayer(playerId);
      await load();
    } catch {
      setError(t('moderation.blockError'));
    }
  }

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-5">
      <h2 className="mb-1 text-sm font-semibold">{t('moderation.blockedPlayers')}</h2>
      <p className="mb-3 text-xs text-textMuted">{t('moderation.blockedPlayersHint')}</p>
      {blocked && blocked.length === 0 && <p className="text-xs text-textFaint">{t('moderation.noBlockedPlayers')}</p>}
      {blocked && blocked.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {blocked.map((player) => (
            <div key={player.playerId} className="flex items-center justify-between gap-2 rounded-md border border-wellBorder bg-well px-3 py-2 text-xs">
              <span className="min-w-0 truncate">
                <PlayerLink playerId={player.playerId} username={player.username} />{' '}
                <span className="text-textFaint">
                  · {t('dashboard.level')} {player.level}
                </span>
              </span>
              <button
                type="button"
                onClick={() => handleUnblock(player.playerId)}
                className="shrink-0 rounded-md border border-wellBorder px-3 py-1 text-[10px] uppercase text-textMuted hover:text-text"
              >
                {t('moderation.unblock')}
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
    </section>
  );
}

/**
 * Account deletion (owner decision, 2026-10-12 — app-store requirement):
 * current password + a one-time code shown on screen, then a grace period
 * (set in godmaster) during which it can be cancelled. History stays, shown as
 * "Deleted player"; personal data is wiped.
 */
function DeleteAccountSection() {
  const t = useTranslations();
  const [status, setStatus] = useState<AccountDeletionStatusDto | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [typedCode, setTypedCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAccountDeletionStatus()
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  async function handleStart() {
    setError(null);
    try {
      const res = await getAccountDeletionCode();
      setCode(res.code);
      setOpen(true);
    } catch {
      setError(t('accountDeletion.error'));
    }
  }

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setStatus(await requestAccountDeletion(password, typedCode));
      setOpen(false);
      setPassword('');
      setTypedCode('');
      notifyProfileChanged();
    } catch (err) {
      const map: Record<string, string> = {
        WRONG_PASSWORD: t('accountDeletion.errorWrongPassword'),
        WRONG_DELETION_CODE: t('accountDeletion.errorWrongCode'),
        DELETION_ALREADY_SCHEDULED: t('accountDeletion.errorAlreadyScheduled'),
      };
      setError(err instanceof ApiError && err.code && map[err.code] ? map[err.code] : t('accountDeletion.error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setError(null);
    try {
      setStatus(await cancelAccountDeletion());
      notifyProfileChanged();
    } catch {
      setError(t('accountDeletion.error'));
    }
  }

  return (
    <section className="rounded-lg border border-panelBorderDanger bg-panel p-5">
      <h2 className="mb-1 text-sm font-semibold text-danger">{t('accountDeletion.title')}</h2>

      {status?.scheduledFor ? (
        <>
          <p className="mb-3 text-xs text-danger">{t('accountDeletion.scheduled', { date: formatDateTime(status.scheduledFor) })}</p>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md border border-accent bg-accentBg px-4 py-2 text-[11px] uppercase hover:bg-accentBgHover"
          >
            {t('accountDeletion.cancel')}
          </button>
        </>
      ) : (
        <>
          <p className="mb-1 text-xs text-textMuted">{t('accountDeletion.explainWhat')}</p>
          <p className="mb-3 text-xs text-textMuted">{t('accountDeletion.explainGrace', { days: status?.graceDays ?? 3 })}</p>

          {!open ? (
            <button
              type="button"
              onClick={handleStart}
              className="rounded-md border border-panelBorderDanger bg-well px-4 py-2 text-[11px] uppercase text-danger hover:bg-accentBgHover"
            >
              {t('accountDeletion.start')}
            </button>
          ) : (
            <form onSubmit={handleConfirm} className="flex max-w-sm flex-col gap-3">
              <p className="text-xs text-textMuted">{t('accountDeletion.codeHint')}</p>
              {/* Not selectable/copyable on purpose — it has to be read and retyped. */}
              <p className="select-none rounded-md border border-wellBorder bg-well px-3 py-2 text-center font-mono text-lg tracking-widest text-text">{code}</p>
              {/* Visible labels, and "one-time-code" so the browser doesn't autofill the
                  saved email into the code field (it otherwise treats the text input
                  right before a password field as the username). */}
              <label className="flex flex-col gap-1 text-[11px] text-textMuted">
                {t('accountDeletion.codePlaceholder')}
                <input
                  type="text"
                  name="deletion-code"
                  value={typedCode}
                  onChange={(e) => setTypedCode(e.target.value)}
                  autoComplete="one-time-code"
                  spellCheck={false}
                  className="rounded-md border border-wellBorder bg-well px-3 py-2 font-mono text-sm uppercase tracking-widest text-text outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-textMuted">
                {t('accountDeletion.passwordPlaceholder')}
                <input
                  type="password"
                  name="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy || !password || !typedCode}
                  className="flex-1 rounded-md border border-panelBorderDanger bg-well py-2 text-[11px] uppercase text-danger hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('accountDeletion.confirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-md border border-panelBorder py-2 text-[11px] uppercase text-textMuted hover:bg-accentBgHover"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
    </section>
  );
}

