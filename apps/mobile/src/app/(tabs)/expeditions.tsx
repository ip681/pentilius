import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import type { ExpeditionClaimResultDto, ExpeditionsResponseDto } from '@pentilius/shared';
import { AssetImage, ResourceIcon } from '@/components/AssetImage';
import { ActionButton, ConfirmButton } from '@/components/ConfirmButton';
import { ScreenTitle } from '@/components/ScreenTitle';
import { cancelExpedition, claimExpedition, getExpeditions, startExpedition } from '@/lib/api';
import { formatDuration } from '@/lib/duration';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTicker } from '@/lib/use-ticker';
import { colors } from '@/theme';

// The web's Expeditions page, as on a phone.
export default function ExpeditionsScreen() {
  const { refresh: refreshProfile } = useSession();
  const [data, setData] = useState<ExpeditionsResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExpeditionClaimResultDto | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getExpeditions());
    } catch {
      setError(t('expeditions.loadError'));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useTicker([data?.active?.endsAt], load);

  async function run(action: () => Promise<unknown>, errorKey: string) {
    setError(null);
    try {
      await action();
      refreshProfile();
      await load();
    } catch {
      setError(t(errorKey));
    }
  }

  const active = data?.active;
  const remainingMs = active ? new Date(active.endsAt).getTime() - Date.now() : 0;
  const completed = active ? remainingMs <= 0 : false;
  const percent = Math.round((data?.earlyCancelPercentage ?? 0) * 100);

  return (
    <ScrollView
      style={{ backgroundColor: colors.ink }}
      contentContainerStyle={{ padding: 12, paddingBottom: 24, gap: 20 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.text}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <View style={{ marginBottom: -20 }}>
        <ScreenTitle title={t('expeditions.title')} subtitle={t('expeditions.subtitle')} />
        <Text style={{ marginTop: -22, marginBottom: 24, fontSize: 11, color: colors.textFaint }}>{t('expeditions.rewardsHint')}</Text>
      </View>
      {error && <Text style={{ color: '#f87171' }}>{error}</Text>}

      {result && (
        <View style={[panel, { padding: 20, gap: 6 }]}>
          <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text }}>{t('expeditions.claimedTitle')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>+{formatNumber(result.rewards.metal)}</Text>
            <ResourceIcon type="METAL" size={16} />
            <Text style={{ fontSize: 12, color: colors.textMuted }}>· +{formatNumber(result.rewards.crystal)}</Text>
            <ResourceIcon type="CRYSTAL" size={16} />
            <Text style={{ fontSize: 12, color: colors.textMuted }}>
              · +{formatNumber(result.rewards.xp)} {t('pve.xpGained')}
            </Text>
          </View>
          {result.bonusItem && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 12, color: colors.positive }}>{t('expeditions.bonusItemFound')}:</Text>
              <AssetImage assetId={result.bonusItem.itemIconAssetId} size={16} label={t(result.bonusItem.itemNameKey)} />
              <Text style={{ fontSize: 12, color: colors.positive }}>{t(result.bonusItem.itemNameKey)}</Text>
            </View>
          )}
          {result.leveledUp && <Text style={{ fontSize: 12, fontWeight: '500', color: colors.text }}>{t('pve.leveledUp', { level: result.playerLevel })}</Text>}
        </View>
      )}

      {active ? (
        <View style={[panel, { padding: 24, alignItems: 'center', gap: 8 }]}>
          <Text style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>{t('expeditions.inProgress')}</Text>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 8 }}>{t(active.expeditionNameKey)}</Text>
          {completed ? (
            <>
              <Text style={{ fontSize: 14, color: colors.positive, marginBottom: 8 }}>{t('expeditions.readyToClaim')}</Text>
              <ActionButton label={t('expeditions.claim')} onPress={() => run(async () => setResult(await claimExpedition()), 'expeditions.claimError')} />
            </>
          ) : (
            <>
              <Text style={{ fontSize: 30, fontWeight: '600', color: colors.text, marginBottom: 8, fontVariant: ['tabular-nums'] }}>{formatDuration(remainingMs / 1000)}</Text>
              <ConfirmButton tone="danger" label={t('expeditions.cancel')} message={t('expeditions.cancelConfirm', { percent })} onConfirm={() => run(async () => setResult(await cancelExpedition()), 'expeditions.cancelError')} />
              <Text style={{ fontSize: 10, color: colors.textFaint }}>{t('expeditions.cancelHint', { percent })}</Text>
            </>
          )}
        </View>
      ) : (
        data?.types.map((type) => (
          <View key={type.key} style={[panel, { padding: 20 }]}>
            <Text style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint, marginBottom: 4 }}>{Math.round(type.durationMinutes / 60)}h</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 16 }}>{t(type.nameKey)}</Text>
            <View style={{ gap: 4, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>+{formatNumber(type.rewards.metal)}</Text>
                <ResourceIcon type="METAL" size={16} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>+{formatNumber(type.rewards.crystal)}</Text>
                <ResourceIcon type="CRYSTAL" size={16} />
              </View>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>
                +{formatNumber(type.rewards.xp)} {t('pve.xpGained')}
              </Text>
              {type.bonusItemTier && !!type.bonusItemChance && (
                <Text style={{ fontSize: 12, color: colors.textFaint }}>
                  {t('expeditions.bonusSetItem', { percent: Math.round(type.bonusItemChance * 100), set: t(`shop.tier.${type.bonusItemTier}`) })}
                </Text>
              )}
            </View>
            {type.locked && <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center', marginBottom: 8 }}>{t('research.needsNavigation', { level: type.requiredNavigationLevel })}</Text>}
            <ActionButton label={t('expeditions.start')} disabled={type.locked} onPress={() => run(() => startExpedition(type.key), 'expeditions.startError')} />
          </View>
        ))
      )}
    </ScrollView>
  );
}

const panel = { backgroundColor: colors.panel, borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 8 } as const;
