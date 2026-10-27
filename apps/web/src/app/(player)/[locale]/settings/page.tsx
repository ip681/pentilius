'use client';

import type { AccountDeletionStatusDto, BlockedPlayerDto, CosmeticsCatalogDto, PurchaseDto } from '@pentilius/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { GameLayout } from '@/components/GameLayout';
import { IdentityChangeSection } from '@/components/IdentityChangeSection';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import { PlayerLink } from '@/components/PlayerLink';
import { NotificationSettingsSection } from '@/components/NotificationSettingsSection';
import { SupportSection } from '@/components/SupportSection';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import {
  ApiError,
  cancelAccountDeletion,
  changePassword,
  getAccountDeletionCode,
  getAccountDeletionStatus,
  getBlockedPlayers,
  getCosmeticsCatalog,
  getProfile,
  getPurchases,
  getSupportTickets,
  requestAccountDeletion,
  unblockPlayer,
  updateAvatar,
  updateFrame,
  updatePreferredLocale,
} from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-datetime';
import { formatDuration } from '@/lib/format-duration';
import { formatPrice } from '@/lib/format-price';
import { productName } from '@/components/ShopOffers';
import { notifyProfileChanged } from '@/lib/profile-events';
import { getDeviceState } from '@/lib/push';
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

  // VIP card (owner decision, 2026-10-14): time left and what VIP gives.
  const [vip, setVip] = useState<{ until: string | null; multiAttack: number; maxEnergy: number; canBuy: boolean } | null>(null);
  const [purchases, setPurchases] = useState<PurchaseDto[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);
  const vipSecondsLeft = vip?.until ? Math.max(0, Math.floor((new Date(vip.until).getTime() - now) / 1000)) : 0;

  // Settings as cards that open a popup (owner decision, 2026-10-13).
  const [open, setOpen] = useState<SettingsCardKey | null>(null);
  const [summary, setSummary] = useState<{ notificationsOn: boolean; supportUnread: boolean; blockedCount: number | null; deletionScheduledFor: string | null }>({
    notificationsOn: false,
    supportUnread: false,
    blockedCount: null,
    deletionScheduledFor: null,
  });

  // The cards' status lines — refreshed on open and whenever a popup closes.
  function loadSummary() {
    setSummary((s) => ({ ...s, notificationsOn: getDeviceState() === 'on' }));
    getSupportTickets()
      .then((tickets) => setSummary((s) => ({ ...s, supportUnread: tickets.some((ticket) => ticket.unread) })))
      .catch(() => undefined);
    getBlockedPlayers()
      .then((list) => setSummary((s) => ({ ...s, blockedCount: list.length })))
      .catch(() => undefined);
    getAccountDeletionStatus()
      .then((status) => setSummary((s) => ({ ...s, deletionScheduledFor: status.scheduledFor })))
      .catch(() => undefined);
  }

  useEffect(() => {
    loadSummary();
    // The Support page links here with #support.
    if (window.location.hash === '#support') setOpen('support');
  }, []);

  function closeSheet() {
    setOpen(null);
    loadSummary();
  }

  useEffect(() => {
    getProfile()
      .then((data) => {
        setSelectedLocale(data.preferredLocale ?? locale);
        setSelectedAvatarKey(data.selectedAvatarKey);
        setSelectedFrameKey(data.selectedFrameKey);
        setVip({ until: data.vipUntil, multiAttack: data.vipMultiAttackCount, maxEnergy: data.vipMaxEnergyBonus, canBuy: !!data.paymentsAvailable });
        if (data.paymentsAvailable) getPurchases().then(setPurchases).catch(() => undefined);
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

      <div className="grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SettingsCard title={t('settings.vip.title')} onClick={() => setOpen('vip')}>
          {vipSecondsLeft > 0 ? (
            <span className="text-vipGold">{t('settings.vip.activeFor', { time: formatDuration(vipSecondsLeft) })}</span>
          ) : (
            t('settings.vip.inactive')
          )}
        </SettingsCard>
        {/* Hidden while the app isn't worked on (owner decision, 2026-10-27); the download itself stays. */}
        {SHOW_APP_DOWNLOAD && (
          <SettingsCard title={t('settings.app.title')} onClick={() => setOpen('app')}>
            {t('settings.app.card')}
          </SettingsCard>
        )}
        {vip?.canBuy && (
          <SettingsCard title={t('payments.history.title')} onClick={() => setOpen('purchases')}>
            {purchases && purchases.length > 0 ? t('payments.history.count', { count: purchases.length }) : t('payments.history.empty')}
          </SettingsCard>
        )}
        <SettingsCard title={t('settings.cosmeticsSection')} onClick={() => setOpen('cosmetics')}>
          <span className="flex items-center gap-2">
            <PlayerAvatarFrame avatarKey={selectedAvatarKey} frameKey={selectedFrameKey} className="h-8 w-8" />
            {t('settings.cards.cosmetics')}
          </span>
        </SettingsCard>
        <SettingsCard title={t('settings.languageSection')} onClick={() => setOpen('language')}>
          {t(`settings.cards.languageNames.${selectedLocale === 'en' ? 'en' : 'bg'}`)}
        </SettingsCard>
        <SettingsCard title={t('settings.identity.title')} onClick={() => setOpen('identity')}>
          {t('settings.cards.identity')}
        </SettingsCard>
        <SettingsCard title={t('settings.passwordSection')} onClick={() => setOpen('password')}>
          {t('settings.cards.password')}
        </SettingsCard>
        <SettingsCard title={t('notifications.settings.title')} onClick={() => setOpen('notifications')}>
          {summary.notificationsOn ? t('settings.cards.notificationsOn') : t('settings.cards.notificationsOff')}
        </SettingsCard>
        <SettingsCard title={t('support.title')} dot={summary.supportUnread} onClick={() => setOpen('support')}>
          {summary.supportUnread ? t('settings.cards.supportNew') : t('settings.cards.supportIdle')}
        </SettingsCard>
        <SettingsCard title={t('moderation.blockedPlayers')} onClick={() => setOpen('blocked')}>
          {summary.blockedCount === null || summary.blockedCount === 0
            ? t('settings.cards.blockedNone')
            : t('settings.cards.blockedCount', { count: summary.blockedCount })}
        </SettingsCard>
        <SettingsCard title={t('accountDeletion.title')} danger onClick={() => setOpen('delete')}>
          {summary.deletionScheduledFor
            ? t('settings.cards.deleteScheduled', { date: formatDateTime(summary.deletionScheduledFor) })
            : t('settings.cards.deleteIdle')}
        </SettingsCard>
      </div>

      <BottomSheet open={open !== null} onClose={closeSheet} wide={open !== 'password' && open !== 'language'}>
        {open === 'vip' && (
          <section>
            <h2 className="mb-3 text-sm font-semibold">{t('settings.vip.title')}</h2>
            <p className={`mb-3 rounded-md border px-3 py-2 text-xs ${vipSecondsLeft > 0 ? 'border-vipGold text-vipGold' : 'border-wellBorder text-textMuted'}`}>
              {vipSecondsLeft > 0 && vip?.until
                ? t('settings.vip.activeUntil', { time: formatDuration(vipSecondsLeft), date: formatDateTime(vip.until) })
                : t('settings.vip.inactive')}
            </p>
            <h3 className="mb-2 text-[11px] uppercase tracking-wide text-textFaint">{t('settings.vip.perksTitle')}</h3>
            <ul className="flex flex-col gap-1.5 text-xs text-text">
              <li>• {t('settings.vip.perks.multiAttack', { count: vip?.multiAttack ?? 3 })}</li>
              <li>• {t('settings.vip.perks.buildQueue')}</li>
              <li>• {t('settings.vip.perks.maxEnergy', { amount: vip?.maxEnergy ?? 3 })}</li>
              <li>• {t('settings.vip.perks.autoClaim')}</li>
              <li>• {t('settings.vip.perks.goldName')}</li>
            </ul>
            {vip?.canBuy && (
              <Link
                href="/shop#offers"
                className="mt-4 block rounded-md border border-vipGold bg-accentBg py-2 text-center text-xs uppercase text-vipGold hover:bg-accentBgHover"
              >
                {t('settings.vip.buy')}
              </Link>
            )}
          </section>
        )}
        {open === 'app' && <AppDownloadSection />}
        {open === 'purchases' && (
          <section>
            <h2 className="mb-3 text-sm font-semibold">{t('payments.history.title')}</h2>
            {!purchases || purchases.length === 0 ? (
              <p className="text-xs text-textMuted">{t('payments.history.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {purchases.map((purchase) => (
                  <li key={purchase.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-wellBorder bg-well px-3 py-2 text-xs">
                    <span>
                      {productName(purchase, locale, t)} <span className="text-textFaint">· {formatDateTime(purchase.createdAt)}</span>
                    </span>
                    <span className="tabular-nums">
                      {formatPrice(purchase.amountCents, purchase.currency, locale)}
                      {purchase.status === 'REFUNDED' && <span className="ml-2 text-textFaint">{t('payments.history.refunded')}</span>}
                    </span>
                    {(purchase.saleDocumentId || purchase.refundDocumentId) && (
                      <span className="flex w-full flex-wrap gap-3">
                        {purchase.saleDocumentId && (
                          <Link href={`/documents/${purchase.saleDocumentId}`} className="text-accent underline">
                            {t('payments.history.document')}
                          </Link>
                        )}
                        {purchase.refundDocumentId && (
                          <Link href={`/documents/${purchase.refundDocumentId}`} className="text-accent underline">
                            {t('payments.history.refundDocument')}
                          </Link>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {open === 'password' && (
          <section>
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
              <button type="submit" className="self-start rounded-md border border-accent bg-accentBg px-5 py-2 text-xs uppercase hover:bg-accentBgHover">
                {t('settings.save')}
              </button>
            </form>
          </section>
        )}

        {open === 'language' && (
          <section>
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
              <button type="submit" className="self-start rounded-md border border-accent bg-accentBg px-5 py-2 text-xs uppercase hover:bg-accentBgHover">
                {t('settings.save')}
              </button>
            </form>
          </section>
        )}

        {open === 'cosmetics' && (
          <section>
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
        )}

        {open === 'identity' && <IdentityChangeSection />}
        {open === 'notifications' && <NotificationSettingsSection />}
        {open === 'support' && <SupportSection />}
        {open === 'blocked' && <BlockedPlayersSection />}
        {open === 'delete' && <DeleteAccountSection />}

        <button type="button" onClick={closeSheet} className="mt-4 w-full text-center text-xs text-textFaint underline">
          {t('common.close')}
        </button>
      </BottomSheet>
    </GameLayout>
  );
}

type SettingsCardKey = 'vip' | 'app' | 'purchases' | 'cosmetics' | 'language' | 'identity' | 'password' | 'notifications' | 'support' | 'blocked' | 'delete';

// The phone-app download card (owner decision, 2026-10-27: hidden while the app isn't worked on).
const SHOW_APP_DOWNLOAD = false;

// The Android app (owner decision, 2026-10-19): served from the game's own
// server while it isn't in Google Play yet. iPhone only through the App Store, later.
const ANDROID_APK_URL = '/download/pentilius.apk';

/** Download of the phone app — what's shown depends on the device. */
function AppDownloadSection() {
  const t = useTranslations();
  const [device, setDevice] = useState<'android' | 'ios' | 'other' | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    setDevice(/Android/i.test(ua) ? 'android' : /iPhone|iPad|iPod/i.test(ua) ? 'ios' : 'other');
  }, []);

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">{t('settings.app.title')}</h2>
      {device === 'ios' ? (
        <p className="text-xs text-textMuted">{t('settings.app.ios')}</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-textMuted">{device === 'android' ? t('settings.app.android') : t('settings.app.desktop')}</p>
          <a
            href={ANDROID_APK_URL}
            download
            className="block rounded-md border border-accent bg-accentBg py-2 text-center text-xs uppercase hover:bg-accentBgHover"
          >
            {t('settings.app.download')}
          </a>
          {device === 'other' && (
            <p className="mt-2 break-all text-center text-[11px] text-textFaint">{typeof window !== 'undefined' ? window.location.origin + ANDROID_APK_URL : ANDROID_APK_URL}</p>
          )}
          <h3 className="mb-2 mt-4 text-[11px] uppercase tracking-wide text-textFaint">{t('settings.app.howTitle')}</h3>
          <ol className="flex flex-col gap-1.5 text-xs text-text">
            <li>1. {t('settings.app.step1')}</li>
            <li>2. {t('settings.app.step2')}</li>
            <li>3. {t('settings.app.step3')}</li>
          </ol>
          <p className="mt-3 text-[11px] text-textFaint">{t('settings.app.note')}</p>
        </>
      )}
    </section>
  );
}

/** One settings card: a title and a status line; a click opens its popup. */
function SettingsCard({
  title,
  children,
  onClick,
  dot = false,
  danger = false,
}: {
  title: string;
  children: React.ReactNode;
  onClick: () => void;
  dot?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex min-h-[84px] flex-col justify-center gap-1 rounded-lg border bg-panel px-4 py-3 text-left transition-all hover:-translate-y-0.5 ${
        danger ? 'border-panelBorderDanger hover:border-danger' : 'border-panelBorder hover:border-accent'
      }`}
    >
      {dot && <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-danger" />}
      <h2 className={`text-sm font-semibold ${danger ? 'text-danger' : ''}`}>{title}</h2>
      <div className="text-xs text-textMuted">{children}</div>
    </button>
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
    <section>
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
    <section>
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

