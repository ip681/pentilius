import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { AccountDeletionStatusDto, BlockedPlayerDto, NotificationSettingsDto, NotificationType, SupportCategoryValue, SupportTicketDto } from '@pentilius/shared';
import { CheckRow } from '@/components/ConfirmButton';
import { PlayerLink } from '@/components/PlayerLink';
import {
  ApiError,
  cancelAccountDeletion,
  createSupportTicket,
  getAccountDeletionCode,
  getAccountDeletionStatus,
  getBlockedPlayers,
  getNotificationSettings,
  getSupportTickets,
  markSupportTicketRead,
  replySupportTicket,
  requestAccountDeletion,
  unblockPlayer,
  updateNotificationSettings,
} from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

// The bigger parts of the web's Settings popups, as on a phone.

export function SheetTitle({ children, danger = false }: { children: string; danger?: boolean }) {
  return <Text style={{ fontSize: 14, fontWeight: '600', color: danger ? colors.danger : colors.text }}>{children}</Text>;
}

export function Hint({ children }: { children: string }) {
  return <Text style={{ fontSize: 12, color: colors.textMuted }}>{children}</Text>;
}

export function SmallButton({ label, onPress, tone = 'accent', disabled = false }: { label: string; onPress: () => void; tone?: 'accent' | 'plain' | 'danger'; disabled?: boolean }) {
  const border = tone === 'accent' ? colors.accent : tone === 'danger' ? colors.panelBorderDanger : colors.wellBorder;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{ alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1, borderColor: border, backgroundColor: tone === 'accent' ? colors.accentBg : colors.well, paddingHorizontal: 16, paddingVertical: 8, opacity: disabled ? 0.35 : 1 }}
    >
      <Text style={{ fontSize: 11, textTransform: 'uppercase', color: tone === 'danger' ? colors.danger : tone === 'plain' ? colors.textMuted : colors.text }}>{label}</Text>
    </Pressable>
  );
}

const inputStyle = { borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: colors.text } as const;

const NOTIFICATION_TYPES: NotificationType[] = ['ENERGY_FULL', 'CONSTRUCTION_DONE', 'RESEARCH_DONE', 'EXPEDITION_DONE', 'PVP_ATTACKED'];

/** Which kinds of notifications to get — server-side, shared by every device. Phone notifications come later. */
export function NotificationSettingsSection() {
  const [settings, setSettings] = useState<NotificationSettingsDto | null>(null);
  useEffect(() => {
    getNotificationSettings()
      .then((res) => setSettings(res.settings))
      .catch(() => undefined);
  }, []);

  async function toggle(type: NotificationType) {
    if (!settings) return;
    const next = { ...settings, [type]: !settings[type] };
    setSettings(next);
    try {
      setSettings((await updateNotificationSettings(next)).settings);
    } catch {
      setSettings(settings);
    }
  }

  return (
    <>
      <SheetTitle>{t('notifications.settings.title')}</SheetTitle>
      <Hint>{t('mobile.notificationsLater')}</Hint>
      {NOTIFICATION_TYPES.map((type) => (
        <CheckRow key={type} label={t(`notifications.settings.types.${type}`)} checked={settings?.[type] ?? true} disabled={!settings} onChange={() => toggle(type)} />
      ))}
      <Text style={{ fontSize: 10, color: colors.textFaint }}>{t('notifications.settings.note')}</Text>
    </>
  );
}

const CATEGORIES: SupportCategoryValue[] = ['IDEA', 'BUG', 'QUESTION', 'OTHER'];
const MAX_SUPPORT_LENGTH = 2000;

function supportErrorText(err: unknown): string {
  const code = err instanceof ApiError ? err.code : null;
  if (code === 'SUPPORT_DAILY_LIMIT') return t('support.errorDailyLimit');
  if (code === 'SUPPORT_OPEN_LIMIT') return t('support.errorOpenLimit');
  if (code === 'SUPPORT_WAIT_FOR_REPLY') return t('support.errorWaitForReply');
  if (code === 'TICKET_CLOSED') return t('support.errorClosed');
  return t('support.errorGeneric');
}

/** "Contact the team": a new message and your own conversations; staff replies show as "the Pentilius team". */
export function SupportSection() {
  const [tickets, setTickets] = useState<SupportTicketDto[] | null>(null);
  const [category, setCategory] = useState<SupportCategoryValue>('IDEA');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    getSupportTickets()
      .then(setTickets)
      .catch(() => undefined);
  }, []);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      setTickets(await createSupportTicket(category, text));
      setText('');
      setSent(true);
    } catch (err) {
      setError(supportErrorText(err));
    } finally {
      setSending(false);
    }
  }

  async function toggle(ticket: SupportTicketDto) {
    const next = openId === ticket.id ? null : ticket.id;
    setOpenId(next);
    if (next && ticket.unread) {
      await markSupportTicketRead(ticket.id).catch(() => undefined);
      setTickets((list) => list?.map((item) => (item.id === ticket.id ? { ...item, unread: false } : item)) ?? null);
    }
  }

  return (
    <>
      <SheetTitle>{t('support.title')}</SheetTitle>
      <Hint>{t('support.intro')}</Hint>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {CATEGORIES.map((value) => (
          <Pressable
            key={value}
            onPress={() => setCategory(value)}
            style={{ borderRadius: 6, borderWidth: 1, borderColor: category === value ? colors.accent : colors.wellBorder, backgroundColor: category === value ? colors.accentBg : 'transparent', paddingHorizontal: 10, paddingVertical: 5 }}
          >
            <Text style={{ fontSize: 11, color: category === value ? colors.text : colors.textMuted }}>{t(`support.categories.${value}`)}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={(v) => setText(v.slice(0, MAX_SUPPORT_LENGTH))}
        multiline
        numberOfLines={4}
        placeholder={t('support.placeholder')}
        placeholderTextColor={colors.textFaint}
        style={[inputStyle, { minHeight: 90, textAlignVertical: 'top', fontSize: 12 }]}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 10, color: colors.textFaint }}>
          {text.length}/{MAX_SUPPORT_LENGTH}
        </Text>
        <SmallButton label={t('support.send')} disabled={sending || !text.trim()} onPress={send} />
      </View>
      {error && <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>}
      {sent && <Text style={{ fontSize: 12, color: colors.positive }}>{t('support.sent')}</Text>}

      {tickets && tickets.length > 0 && (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>{t('support.myMessages')}</Text>
          {tickets.map((ticket) => (
            <TicketItem key={ticket.id} ticket={ticket} open={openId === ticket.id} onToggle={() => toggle(ticket)} onReplied={setTickets} />
          ))}
        </View>
      )}
    </>
  );
}

function TicketItem({ ticket, open, onToggle, onReplied }: { ticket: SupportTicketDto; open: boolean; onToggle: () => void; onReplied: (tickets: SupportTicketDto[]) => void }) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      onReplied(await replySupportTicket(ticket.id, reply));
      setReply('');
    } catch (err) {
      setError(supportErrorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well }}>
      <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
        {ticket.unread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />}
        <Text style={{ fontSize: 12, color: colors.textFaint }}>{t(`support.categories.${ticket.category}`)}</Text>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: colors.text }}>
          {ticket.messages[0]?.text ?? ''}
        </Text>
        <Text style={{ fontSize: 10, textTransform: 'uppercase', color: ticket.status === 'ANSWERED' ? colors.positive : colors.textFaint }}>{t(`support.status.${ticket.status}`)}</Text>
      </Pressable>
      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.wellBorder, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
          {ticket.messages.map((message) => (
            <View key={message.id} style={{ borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, borderWidth: message.fromStaff ? 1 : 0, borderColor: 'rgba(64,83,96,0.4)', backgroundColor: message.fromStaff ? colors.accentBg : colors.panel }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: message.fromStaff ? '600' : '400', color: message.fromStaff ? colors.text : colors.textFaint }}>{message.fromStaff ? t('support.team') : t('support.you')}</Text>
                <Text style={{ fontSize: 10, color: colors.textFaint }}>{formatDateTime(message.createdAt)}</Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>{message.text}</Text>
            </View>
          ))}
          {ticket.status === 'CLOSED' ? (
            <Text style={{ fontSize: 11, color: colors.textFaint }}>{t('support.closedNote')}</Text>
          ) : (
            <>
              <TextInput
                value={reply}
                onChangeText={(v) => setReply(v.slice(0, MAX_SUPPORT_LENGTH))}
                multiline
                placeholder={t('support.replyPlaceholder')}
                placeholderTextColor={colors.textFaint}
                style={[inputStyle, { minHeight: 56, textAlignVertical: 'top', fontSize: 12, backgroundColor: colors.panel }]}
              />
              <View style={{ alignItems: 'flex-end' }}>
                <SmallButton label={t('support.reply')} disabled={sending || !reply.trim()} onPress={send} />
              </View>
              {error && <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>}
            </>
          )}
        </View>
      )}
    </View>
  );
}

/** Players you've blocked, with unblock. */
export function BlockedPlayersSection() {
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
  }, []);

  async function unblock(playerId: string) {
    setError(null);
    try {
      await unblockPlayer(playerId);
      await load();
    } catch {
      setError(t('moderation.blockError'));
    }
  }

  return (
    <>
      <SheetTitle>{t('moderation.blockedPlayers')}</SheetTitle>
      <Hint>{t('moderation.blockedPlayersHint')}</Hint>
      {blocked && blocked.length === 0 && <Text style={{ fontSize: 12, color: colors.textFaint }}>{t('moderation.noBlockedPlayers')}</Text>}
      {blocked?.map((player) => (
        <View key={player.playerId} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 12 }}>
            <PlayerLink playerId={player.playerId} username={player.username} />
            <Text style={{ color: colors.textFaint }}>
              {' '}
              · {t('dashboard.level')} {player.level}
            </Text>
          </Text>
          <SmallButton label={t('moderation.unblock')} tone="plain" onPress={() => unblock(player.playerId)} />
        </View>
      ))}
      {error && <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>}
    </>
  );
}

/**
 * Account deletion (an app-store requirement): the current password and a
 * one-time code shown on screen, then a grace period during which it can be cancelled.
 */
export function DeleteAccountSection({ onChanged }: { onChanged: () => void }) {
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

  async function start() {
    setError(null);
    try {
      setCode((await getAccountDeletionCode()).code);
      setOpen(true);
    } catch {
      setError(t('accountDeletion.error'));
    }
  }

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      setStatus(await requestAccountDeletion(password, typedCode));
      setOpen(false);
      setPassword('');
      setTypedCode('');
      onChanged();
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

  async function cancel() {
    setError(null);
    try {
      setStatus(await cancelAccountDeletion());
      onChanged();
    } catch {
      setError(t('accountDeletion.error'));
    }
  }

  return (
    <>
      <SheetTitle danger>{t('accountDeletion.title')}</SheetTitle>
      {status?.scheduledFor ? (
        <>
          <Text style={{ fontSize: 12, color: colors.danger }}>{t('accountDeletion.scheduled', { date: formatDateTime(status.scheduledFor) })}</Text>
          <SmallButton label={t('accountDeletion.cancel')} onPress={cancel} />
        </>
      ) : (
        <>
          <Hint>{t('accountDeletion.explainWhat')}</Hint>
          <Hint>{t('accountDeletion.explainGrace', { days: status?.graceDays ?? 3 })}</Hint>
          {!open ? (
            <SmallButton label={t('accountDeletion.start')} tone="danger" onPress={start} />
          ) : (
            <>
              <Hint>{t('accountDeletion.codeHint')}</Hint>
              {/* Not selectable on purpose — it has to be read and retyped. */}
              <Text selectable={false} style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, paddingVertical: 8, textAlign: 'center', fontFamily: 'monospace', fontSize: 18, letterSpacing: 4, color: colors.text }}>
                {code}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textMuted }}>{t('accountDeletion.codePlaceholder')}</Text>
              <TextInput value={typedCode} onChangeText={setTypedCode} autoCapitalize="characters" autoCorrect={false} autoComplete="one-time-code" style={[inputStyle, { fontFamily: 'monospace', letterSpacing: 3 }]} />
              <Text style={{ fontSize: 11, color: colors.textMuted }}>{t('accountDeletion.passwordPlaceholder')}</Text>
              <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" style={inputStyle} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <SmallButton label={t('accountDeletion.confirm')} tone="danger" disabled={busy || !password || !typedCode} onPress={confirm} />
                <SmallButton label={t('common.cancel')} tone="plain" onPress={() => setOpen(false)} />
              </View>
            </>
          )}
        </>
      )}
      {error && <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>}
    </>
  );
}
