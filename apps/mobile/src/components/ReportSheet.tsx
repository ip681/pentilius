import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { ReportReason, ReportTargetType } from '@pentilius/shared';
import { SheetButtons } from '@/components/SheetButtons';
import { Sheet } from '@/components/ui';
import { ApiError, createReport } from '@/lib/api';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

const REASONS: ReportReason[] = ['HARASSMENT', 'OFFENSIVE_CONTENT', 'SPAM', 'CHEATING', 'OTHER'];
const MAX_COMMENT_LENGTH = 300;

/**
 * Report a player, clan or message (the web's ReportSheet — an app-store
 * requirement). The app only says WHAT is reported; the server keeps the
 * content and enforces every limit.
 */
export function ReportSheet({ open, onClose, targetType, targetId, title }: { open: boolean; onClose: () => void; targetType: ReportTargetType; targetId: string; title: string }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason(null);
      setComment('');
      setSent(false);
      setError(null);
    }
  }, [open, targetId]);

  async function submit() {
    if (!reason) return;
    setSending(true);
    setError(null);
    try {
      await createReport({ targetType, targetId, reason, comment: comment.trim() || undefined });
      setSent(true);
    } catch (err) {
      const map: Record<string, string> = {
        REPORTING_SUSPENDED: t('moderation.errorSuspended'),
        REPORTING_NOT_YET_ALLOWED: t('moderation.errorNotYetAllowed'),
        REPORTING_TOO_FAST: t('moderation.errorTooFast'),
        REPORT_DAILY_LIMIT: t('moderation.errorDailyLimit'),
        ALREADY_REPORTED: t('moderation.errorAlreadyReported'),
      };
      setError(err instanceof ApiError && err.code && map[err.code] ? map[err.code] : t('moderation.reportError'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{title}</Text>
      {sent ? (
        <>
          <Text style={{ fontSize: 12, color: colors.positive }}>{t('moderation.reportSent')}</Text>
          <CloseLink onPress={onClose} />
        </>
      ) : (
        <>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>{t('moderation.chooseReason')}</Text>
          <View style={{ gap: 6 }}>
            {REASONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => setReason(r)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, borderColor: reason === r ? colors.accent : colors.wellBorder, backgroundColor: reason === r ? colors.accentBg : colors.well }}
              >
                <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' }}>
                  {reason === r && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.text }} />}
                </View>
                <Text style={{ fontSize: 12, color: colors.text }}>{t(`moderation.reasons.${r}`)}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={comment}
            onChangeText={(text) => setComment(text.slice(0, MAX_COMMENT_LENGTH))}
            placeholder={t('moderation.commentPlaceholder')}
            placeholderTextColor={colors.textFaint}
            multiline
            numberOfLines={3}
            style={{ minHeight: 70, textAlignVertical: 'top', borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, color: colors.text }}
          />
          <Text style={{ textAlign: 'right', fontSize: 10, color: colors.textFaint }}>
            {comment.length}/{MAX_COMMENT_LENGTH}
          </Text>
          {error && <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>}
          <SheetButtons confirmLabel={t('moderation.sendReport')} danger disabled={!reason || sending} onConfirm={submit} onCancel={onClose} />
        </>
      )}
    </Sheet>
  );
}

export function CloseLink({ onPress }: { onPress: () => void }) {
  return (
    <Text onPress={onPress} style={{ marginTop: 4, textAlign: 'center', fontSize: 12, color: colors.textFaint, textDecorationLine: 'underline' }}>
      {t('common.close')}
    </Text>
  );
}
