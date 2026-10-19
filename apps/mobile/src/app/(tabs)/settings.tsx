import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { CosmeticsCatalogDto } from '@pentilius/shared';
import { AssetImage } from '@/components/AssetImage';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import { CloseLink } from '@/components/ReportSheet';
import { ScreenTitle } from '@/components/ScreenTitle';
import { BlockedPlayersSection, DeleteAccountSection, Hint, NotificationSettingsSection, SheetTitle, SmallButton, SupportSection } from '@/components/SettingsSections';
import { Sheet } from '@/components/ui';
import {
  ApiError,
  changePassword,
  getAccountDeletionStatus,
  getBlockedPlayers,
  getCosmeticsCatalog,
  getSupportTickets,
  updateAvatar,
  updateFrame,
  updatePreferredLocale,
} from '@/lib/api';
import { formatDuration } from '@/lib/duration';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { CURRENT_VERSION, downloadUpdate, useNewerVersion } from '@/lib/update';
import { useClock } from '@/lib/use-live';
import { colors } from '@/theme';

type CardKey = 'vip' | 'app' | 'cosmetics' | 'language' | 'password' | 'notifications' | 'support' | 'blocked' | 'delete';

// The web's Settings (apps/web/src/app/(player)/[locale]/settings/page.tsx): cards that open a popup.
// Not here on purpose: buying VIP and the purchase history — real-money payments stay on the web
// until the store apps use Google Play / App Store billing.
export default function SettingsScreen() {
  const { profile, refresh: refreshProfile } = useSession();
  const [open, setOpen] = useState<CardKey | null>(null);
  const [summary, setSummary] = useState<{ supportUnread: boolean; blockedCount: number | null; deletionScheduledFor: string | null }>({ supportUnread: false, blockedCount: null, deletionScheduledFor: null });
  const newerVersion = useNewerVersion();
  const now = useClock();

  // The cards' status lines — refreshed when the screen opens and when a popup closes.
  const loadSummary = useCallback(() => {
    getSupportTickets()
      .then((tickets) => setSummary((s) => ({ ...s, supportUnread: tickets.some((ticket) => ticket.unread) })))
      .catch(() => undefined);
    getBlockedPlayers()
      .then((list) => setSummary((s) => ({ ...s, blockedCount: list.length })))
      .catch(() => undefined);
    getAccountDeletionStatus()
      .then((status) => setSummary((s) => ({ ...s, deletionScheduledFor: status.scheduledFor })))
      .catch(() => undefined);
  }, []);
  useFocusEffect(loadSummary);

  function close() {
    setOpen(null);
    loadSummary();
  }

  const vipSecondsLeft = profile?.vipUntil ? Math.max(0, Math.floor((new Date(profile.vipUntil).getTime() - now) / 1000)) : 0;
  const locale = profile?.preferredLocale === 'en' ? 'en' : 'bg';

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
      <ScreenTitle title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <View style={{ gap: 12 }}>
        <Card title={t('settings.vip.title')} onPress={() => setOpen('vip')}>
          {vipSecondsLeft > 0 ? <Text style={{ color: colors.vipGold }}>{t('settings.vip.activeFor', { time: formatDuration(vipSecondsLeft) })}</Text> : t('settings.vip.inactive')}
        </Card>
        <Card title={t('settings.app.title')} dot={!!newerVersion} onPress={() => setOpen('app')}>
          {newerVersion ? t('mobile.updateAvailable', { version: newerVersion }) : t('mobile.version', { version: CURRENT_VERSION })}
        </Card>
        <Card title={t('settings.cosmeticsSection')} onPress={() => setOpen('cosmetics')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PlayerAvatarFrame avatarKey={profile?.selectedAvatarKey ?? null} frameKey={profile?.selectedFrameKey ?? null} size={32} />
            <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('settings.cards.cosmetics')}</Text>
          </View>
        </Card>
        <Card title={t('settings.languageSection')} onPress={() => setOpen('language')}>
          {t(`settings.cards.languageNames.${locale}`)}
        </Card>
        <Card title={t('settings.passwordSection')} onPress={() => setOpen('password')}>
          {t('settings.cards.password')}
        </Card>
        <Card title={t('notifications.settings.title')} onPress={() => setOpen('notifications')}>
          {t('settings.cards.notificationsOff')}
        </Card>
        <Card title={t('support.title')} dot={summary.supportUnread} onPress={() => setOpen('support')}>
          {summary.supportUnread ? t('settings.cards.supportNew') : t('settings.cards.supportIdle')}
        </Card>
        <Card title={t('moderation.blockedPlayers')} onPress={() => setOpen('blocked')}>
          {!summary.blockedCount ? t('settings.cards.blockedNone') : t('settings.cards.blockedCount', { count: summary.blockedCount })}
        </Card>
        <Card title={t('accountDeletion.title')} danger onPress={() => setOpen('delete')}>
          {summary.deletionScheduledFor ? t('settings.cards.deleteScheduled', { date: formatDateTime(summary.deletionScheduledFor) }) : t('settings.cards.deleteIdle')}
        </Card>
      </View>

      <Sheet open={open !== null} onClose={close}>
        {open === 'vip' && (
          <>
            <SheetTitle>{t('settings.vip.title')}</SheetTitle>
            <Text style={{ borderRadius: 6, borderWidth: 1, borderColor: vipSecondsLeft > 0 ? colors.vipGold : colors.wellBorder, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, color: vipSecondsLeft > 0 ? colors.vipGold : colors.textMuted }}>
              {vipSecondsLeft > 0 && profile?.vipUntil ? t('settings.vip.activeUntil', { time: formatDuration(vipSecondsLeft), date: formatDateTime(profile.vipUntil) }) : t('settings.vip.inactive')}
            </Text>
            <Text style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>{t('settings.vip.perksTitle')}</Text>
            {[
              t('settings.vip.perks.multiAttack', { count: profile?.vipMultiAttackCount ?? 3 }),
              t('settings.vip.perks.buildQueue'),
              t('settings.vip.perks.maxEnergy', { amount: profile?.vipMaxEnergyBonus ?? 3 }),
              t('settings.vip.perks.autoClaim'),
              t('settings.vip.perks.goldName'),
            ].map((perk) => (
              <Text key={perk} style={{ fontSize: 12, color: colors.text }}>
                • {perk}
              </Text>
            ))}
          </>
        )}
        {open === 'app' && (
          <>
            <SheetTitle>{t('settings.app.title')}</SheetTitle>
            <Hint>{t('mobile.version', { version: CURRENT_VERSION })}</Hint>
            {newerVersion ? (
              <>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gold }}>{t('mobile.updateAvailable', { version: newerVersion })}</Text>
                <Hint>{t('mobile.updateHint')}</Hint>
                <SmallButton label={t('mobile.updateDownload')} onPress={downloadUpdate} />
              </>
            ) : (
              <Text style={{ fontSize: 12, color: colors.positive }}>{t('mobile.upToDate')}</Text>
            )}
          </>
        )}
        {open === 'cosmetics' && <CosmeticsSection onChanged={refreshProfile} avatarKey={profile?.selectedAvatarKey ?? null} frameKey={profile?.selectedFrameKey ?? null} />}
        {open === 'language' && <LanguageSection current={locale} onSaved={refreshProfile} />}
        {open === 'password' && <PasswordSection />}
        {open === 'notifications' && <NotificationSettingsSection />}
        {open === 'support' && <SupportSection />}
        {open === 'blocked' && <BlockedPlayersSection />}
        {open === 'delete' && <DeleteAccountSection onChanged={refreshProfile} />}
        <CloseLink onPress={close} />
      </Sheet>
    </ScrollView>
  );
}

/** One settings card: a title and a status line; a tap opens its popup. */
function Card({ title, children, onPress, dot = false, danger = false }: { title: string; children: ReactNode; onPress: () => void; dot?: boolean; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 76, justifyContent: 'center', gap: 4, borderRadius: 8, borderWidth: 1, borderColor: pressed ? (danger ? colors.danger : colors.accent) : danger ? colors.panelBorderDanger : colors.panelBorder, backgroundColor: colors.panel, paddingHorizontal: 16, paddingVertical: 12 })}
    >
      {dot && <View style={{ position: 'absolute', right: 12, top: 12, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger }} />}
      <Text style={{ fontSize: 14, fontWeight: '600', color: danger ? colors.danger : colors.text }}>{title}</Text>
      {typeof children === 'string' ? <Text style={{ fontSize: 12, color: colors.textMuted }}>{children}</Text> : children}
    </Pressable>
  );
}

function CosmeticsSection({ avatarKey, frameKey, onChanged }: { avatarKey: string | null; frameKey: string | null; onChanged: () => void }) {
  const [catalog, setCatalog] = useState<CosmeticsCatalogDto | null>(null);
  const [avatar, setAvatar] = useState(avatarKey);
  const [frame, setFrame] = useState(frameKey);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getCosmeticsCatalog()
      .then(setCatalog)
      .catch(() => undefined);
  }, []);

  async function choose(kind: 'avatar' | 'frame', key: string) {
    setError(null);
    const previous = kind === 'avatar' ? avatar : frame;
    (kind === 'avatar' ? setAvatar : setFrame)(key);
    try {
      await (kind === 'avatar' ? updateAvatar(key) : updateFrame(key));
      onChanged();
    } catch {
      (kind === 'avatar' ? setAvatar : setFrame)(previous);
      setError(t('settings.cosmeticsError'));
    }
  }

  const grid = (items: { key: string; nameKey: string; iconAssetId: string }[], selected: string | null, kind: 'avatar' | 'frame') => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => choose(kind, item.key)}
          style={{ width: '14.5%', aspectRatio: 1, borderRadius: 999, borderWidth: 2, borderColor: selected === item.key ? colors.accent : colors.wellBorder, backgroundColor: colors.well, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
        >
          <AssetImage assetId={item.iconAssetId} size={40} label={item.key.replace(/\D/g, '')} />
        </Pressable>
      ))}
    </View>
  );

  return (
    <>
      <SheetTitle>{t('settings.cosmeticsSection')}</SheetTitle>
      <View style={{ alignItems: 'center' }}>
        <PlayerAvatarFrame avatarKey={avatar} frameKey={frame} size={96} />
      </View>
      <Text style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>{t('settings.avatar')}</Text>
      {catalog && grid(catalog.avatars, avatar, 'avatar')}
      <Text style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>{t('settings.frame')}</Text>
      {catalog && grid(catalog.frames, frame, 'frame')}
      {error && <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>}
    </>
  );
}

function LanguageSection({ current, onSaved }: { current: 'bg' | 'en'; onSaved: () => Promise<void> }) {
  const [selected, setSelected] = useState(current);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await updatePreferredLocale(selected);
      // The new profile switches the app's language and redraws every screen.
      await onSaved();
    } catch {
      setError(t('settings.languageError'));
    }
  }

  return (
    <>
      <SheetTitle>{t('settings.languageSection')}</SheetTitle>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['bg', 'en'] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setSelected(value)}
            style={{ borderRadius: 6, borderWidth: 1, borderColor: selected === value ? colors.accent : colors.wellBorder, backgroundColor: selected === value ? colors.accentBg : colors.well, paddingHorizontal: 16, paddingVertical: 8 }}
          >
            <Text style={{ fontSize: 13, color: colors.text }}>{t(`settings.cards.languageNames.${value}`)}</Text>
          </Pressable>
        ))}
      </View>
      {error && <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>}
      <SmallButton label={t('settings.save')} disabled={selected === current} onPress={save} />
    </>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setError(null);
    setSaved(false);
    if (next !== confirm) return setError(t('settings.passwordMismatch'));
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'INCORRECT_CURRENT_PASSWORD' ? t('settings.incorrectCurrentPassword') : t('settings.passwordError'));
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, autoComplete: 'current-password' | 'new-password') => (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoComplete={autoComplete}
        style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colors.text }}
      />
    </View>
  );

  return (
    <>
      <SheetTitle>{t('settings.passwordSection')}</SheetTitle>
      {field(t('settings.currentPassword'), current, setCurrent, 'current-password')}
      {field(t('settings.newPassword'), next, setNext, 'new-password')}
      {field(t('settings.confirmPassword'), confirm, setConfirm, 'new-password')}
      {error && <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>}
      {saved && <Text style={{ fontSize: 12, color: colors.positive }}>{t('settings.passwordSaved')}</Text>}
      <SmallButton label={t('settings.save')} disabled={!current || next.length < 8} onPress={save} />
    </>
  );
}
