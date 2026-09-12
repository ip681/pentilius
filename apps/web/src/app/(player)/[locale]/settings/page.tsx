'use client';

import type { CosmeticsCatalogDto } from '@pentilius/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { GameLayout } from '@/components/GameLayout';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import { usePathname, useRouter } from '@/i18n/navigation';
import { ApiError, changePassword, getCosmeticsCatalog, getProfile, updateAvatar, updateFrame, updatePreferredLocale } from '@/lib/api-client';
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

      <div className="flex max-w-md flex-col gap-5">
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
      </div>
    </GameLayout>
  );
}
