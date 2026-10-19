import { useState } from 'react';
import { Text } from 'react-native';
import type { ReportTargetType } from '@pentilius/shared';
import { CloseLink, ReportSheet } from '@/components/ReportSheet';
import { SheetButtons, SheetOption } from '@/components/SheetButtons';
import { Sheet } from '@/components/ui';
import { blockPlayer } from '@/lib/api';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

/**
 * The small "⋯" next to someone else's chat message (the web's MessageActions):
 * report the message, and in clan chat also block its author.
 */
export function MessageActions({
  messageId,
  targetType,
  authorId,
  authorName,
  allowBlock,
  onBlocked,
}: {
  messageId: string;
  targetType: Extract<ReportTargetType, 'CLAN_MESSAGE' | 'DIRECT_MESSAGE'>;
  authorId: string;
  authorName: string;
  allowBlock: boolean;
  onBlocked?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function closeMenu() {
    setMenuOpen(false);
    setConfirmingBlock(false);
    setError(null);
  }

  async function block() {
    try {
      await blockPlayer(authorId);
      closeMenu();
      onBlocked?.();
    } catch {
      setError(t('moderation.blockError'));
    }
  }

  return (
    <>
      <Text onPress={() => setMenuOpen(true)} suppressHighlighting style={{ color: colors.textFaint, paddingHorizontal: 4 }}>
        {' ⋯'}
      </Text>
      <Sheet open={menuOpen} onClose={closeMenu}>
        {confirmingBlock ? (
          <>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>{t('moderation.confirmBlockText', { name: authorName })}</Text>
            <SheetButtons confirmLabel={t('moderation.block')} danger onConfirm={block} onCancel={() => setConfirmingBlock(false)} />
          </>
        ) : (
          <>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{authorName}</Text>
            <SheetOption
              label={t('moderation.reportMessage')}
              onPress={() => {
                closeMenu();
                setReportOpen(true);
              }}
            />
            {allowBlock && <SheetOption label={t('moderation.blockName', { name: authorName })} danger onPress={() => setConfirmingBlock(true)} />}
            <CloseLink onPress={closeMenu} />
          </>
        )}
        {error && <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>}
      </Sheet>
      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} targetType={targetType} targetId={messageId} title={t('moderation.reportMessageTitle', { name: authorName })} />
    </>
  );
}
