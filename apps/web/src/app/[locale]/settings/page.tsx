'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GameLayout } from '@/components/GameLayout';
import { usePathname, useRouter } from '@/i18n/navigation';
import { ApiError, changePassword, getProfile, updatePreferredLocale } from '@/lib/api-client';
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

  useEffect(() => {
    getProfile()
      .then((data) => setSelectedLocale(data.preferredLocale ?? locale))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      </div>
    </GameLayout>
  );
}
