import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import type { CombatReportDto } from '@pentilius/shared';
import { LootEntry } from '@/components/LootEntry';
import { PlayerLink } from '@/components/PlayerLink';
import { ScreenTitle } from '@/components/ScreenTitle';
import { getCombatReports } from '@/lib/api';
import { getLocale, t } from '@/lib/i18n';
import { colors } from '@/theme';

// The web's battle-reports table; on a phone it scrolls sideways, as there.
const COLUMNS: [string, number][] = [
  ['reports.type', 90],
  ['reports.zone', 120],
  ['reports.opponent', 130],
  ['reports.outcome', 80],
  ['reports.reward', 170],
  ['reports.date', 150],
];

export default function ReportsScreen() {
  const [reports, setReports] = useState<CombatReportDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () =>
    getCombatReports()
      .then(setReports)
      .catch(() => setError(t('reports.loadError')));
  useEffect(() => {
    load();
  }, []);

  const cell = (width: number, child: React.ReactNode, key: string) => (
    <View key={key} style={{ width, paddingHorizontal: 16, paddingVertical: 10 }}>
      {child}
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.ink }}
      contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
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
      <ScreenTitle title={t('reports.title')} subtitle={t('reports.subtitle')} />
      {error && <Text style={{ color: '#f87171', marginBottom: 16 }}>{error}</Text>}
      <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel, overflow: 'hidden' }}>
        <ScrollView horizontal>
          <View>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.panelBorder, backgroundColor: colors.panelHeader }}>
              {COLUMNS.map(([key, width]) => cell(width, <Text style={{ fontSize: 10, textTransform: 'uppercase', color: colors.textFaint }}>{t(key)}</Text>, key))}
            </View>
            {reports?.map((report) => (
              <View key={`${report.source}-${report.id}`} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.wellBorder }}>
                {cell(90, <Text style={{ fontSize: 13, color: colors.textMuted }}>{t(`reports.source${report.source}`)}</Text>, 'type')}
                {cell(120, <Text style={{ fontSize: 13, color: report.zoneNameKey ? colors.textMuted : colors.textFaint }}>{report.zoneNameKey ? t(report.zoneNameKey) : '—'}</Text>, 'zone')}
                {cell(
                  130,
                  report.source === 'PVP' && report.opponentPlayerId && report.opponentUsername ? (
                    <PlayerLink playerId={report.opponentPlayerId} username={report.opponentUsername} style={{ fontSize: 13 }} />
                  ) : (
                    <Text style={{ fontSize: 13, color: report.opponentNameKey ? colors.text : colors.textFaint }}>{report.opponentNameKey ? t(report.opponentNameKey) : '—'}</Text>
                  ),
                  'opponent',
                )}
                {cell(80, <Text style={{ fontSize: 13, fontWeight: '600', color: report.outcome === 'WIN' ? colors.positive : colors.danger }}>{report.outcome === 'WIN' ? t('reports.win') : t('reports.loss')}</Text>, 'outcome')}
                {cell(
                  170,
                  report.outcome === 'WIN' ? (
                    <View style={{ gap: 2 }}>
                      {report.xpGained > 0 && (
                        <Text style={{ fontSize: 13, color: colors.textMuted }}>
                          +{report.xpGained} {t('pve.xpGained')}
                        </Text>
                      )}
                      {report.lootSummary.map((loot, index) => (
                        <LootEntry key={index} loot={loot} color={colors.textMuted} size={13} />
                      ))}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 13, color: colors.textFaint }}>—</Text>
                  ),
                  'reward',
                )}
                {cell(150, <Text style={{ fontSize: 13, color: colors.textFaint }}>{new Date(report.createdAt).toLocaleString(getLocale() === 'bg' ? 'bg-BG' : 'en-GB')}</Text>, 'date')}
              </View>
            ))}
          </View>
        </ScrollView>
        {reports && reports.length === 0 && <Text style={{ padding: 16, fontSize: 12, color: colors.textFaint }}>{t('reports.noReports')}</Text>}
      </View>
    </ScrollView>
  );
}
