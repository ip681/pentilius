import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import type { ResearchResponseDto, ResearchStateDto } from '@pentilius/shared';
import { ResourceIcon } from '@/components/AssetImage';
import { ActionButton } from '@/components/ConfirmButton';
import { ScreenTitle } from '@/components/ScreenTitle';
import { SpecialLevelsList } from '@/components/SpecialLevelsList';
import { ApiError, getResearches, startResearch } from '@/lib/api';
import { formatDuration, secondsUntil } from '@/lib/duration';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTicker } from '@/lib/use-ticker';
import { colors } from '@/theme';

function progressOf(research: ResearchStateDto) {
  if (!research.researchEndsAt || !research.nextLevelCost) return { active: false, share: 0, secondsLeft: 0 };
  const secondsLeft = secondsUntil(research.researchEndsAt);
  if (secondsLeft <= 0) return { active: false, share: 1, secondsLeft: 0 };
  const total = research.nextLevelCost.researchSeconds;
  return { active: true, share: Math.max(0, Math.min(1, (total - secondsLeft) / total)), secondsLeft };
}

// The web's Research page, as on a phone (opened from the Research Center and the Command Center).
export default function ResearchScreen() {
  const { refresh: refreshProfile } = useSession();
  const [data, setData] = useState<ResearchResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getResearches());
    } catch {
      setError(t('research.loadError'));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useTicker(data?.researches.map((r) => r.researchEndsAt) ?? [], load);

  async function start(key: string) {
    setError(null);
    try {
      await startResearch(key);
      refreshProfile();
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ANOTHER_RESEARCH_IN_PROGRESS') setError(t('research.anotherResearchActive'));
      else if (err instanceof ApiError && err.code === 'RESEARCH_CENTER_LEVEL_REQUIRED') setError(t('research.needsCenter', { level: (data?.researchCap ?? 0) + 1 }));
      else if (err instanceof ApiError && err.status === 400) setError(t('research.notEnoughResources'));
      else setError(t('research.startError'));
    }
  }

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
        <ScreenTitle title={t('research.title')} subtitle={t('research.subtitle')} />
      </View>
      {error && <Text style={{ color: '#f87171' }}>{error}</Text>}
      {data?.researches.map((research) => {
        const progress = progressOf(research);
        const anotherActive = !progress.active && data.researches.some((r) => progressOf(r).active);
        const needsCenter = !progress.active && !!research.nextLevelCost && research.level + 1 > data.researchCap;
        return (
          <View key={research.key} style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.panelBorder, backgroundColor: colors.panelHeader, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 }}>{t(research.nameKey)}</Text>
              <Text style={{ fontSize: 10, textTransform: 'uppercase', color: colors.textFaint }}>
                {t('research.level')} {research.level}/{research.maxLevel}
              </Text>
            </View>
            <View style={{ padding: 20, gap: 12 }}>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>{t(research.descriptionKey)}</Text>
              <Text style={{ fontSize: 11, color: colors.accent }}>{t('research.bonusPerLevel', { percent: Math.round(research.bonusPerLevel * 100) })}</Text>
              {progress.active ? (
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 10, color: colors.textMuted }}>{t('research.inProgress')}</Text>
                    <Text style={{ fontSize: 10, color: colors.textMuted }}>{formatDuration(progress.secondsLeft)}</Text>
                  </View>
                  <View style={{ height: 7, borderRadius: 4, backgroundColor: colors.wellBorder, overflow: 'hidden' }}>
                    <View style={{ width: `${progress.share * 100}%`, height: '100%', backgroundColor: colors.accent }} />
                  </View>
                </View>
              ) : research.nextLevelCost ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={well}>
                    <Text style={{ fontSize: 8, textTransform: 'uppercase', color: colors.textFaint, marginBottom: 4 }}>{t('research.nextLevelCost')}</Text>
                    {([
                      ['METAL', research.nextLevelCost.metalCost],
                      ['CRYSTAL', research.nextLevelCost.crystalCost],
                      ['CREDITS', research.nextLevelCost.creditsCost],
                    ] as const)
                      .filter(([type, amount]) => type !== 'CREDITS' || amount > 0)
                      .map(([type, amount]) => (
                        <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <ResourceIcon type={type} size={16} />
                          <Text style={{ fontSize: 14, color: colors.text }}>{formatNumber(amount)}</Text>
                        </View>
                      ))}
                  </View>
                  <View style={well}>
                    <Text style={{ fontSize: 8, textTransform: 'uppercase', color: colors.textFaint, marginBottom: 4 }}>{t('research.researchTime')}</Text>
                    <Text style={{ fontSize: 14, color: colors.text }}>{formatDuration(research.nextLevelCost.researchSeconds)}</Text>
                  </View>
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('research.maxLevel')}</Text>
              )}
              <SpecialLevelsList levels={research.specialLevels} />
              {needsCenter && <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center' }}>{t('research.needsCenter', { level: research.level + 1 })}</Text>}
              <ActionButton label={t('research.start')} disabled={progress.active || !research.nextLevelCost || needsCenter || anotherActive} onPress={() => start(research.key)} />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const well = { flex: 1, borderRadius: 4, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, padding: 10 } as const;
