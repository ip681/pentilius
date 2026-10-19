import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, ClipPath, Defs, G, Image as SvgImage, Line, Path, Rect, Text as SvgText, TSpan } from 'react-native-svg';
import type { BossDto, CoreStateDto, ZoneDto } from '@pentilius/shared';
import { AssetImage } from '@/components/AssetImage';
import { ActionButton } from '@/components/ConfirmButton';
import { EnergyRefill } from '@/components/EnergyRefill';
import { ApiError, attackPentili, attackPentiliMulti, getBossFormations, getCoreState, getZones } from '@/lib/api';
import { assetUrl } from '@/lib/assets';
import { formatDuration } from '@/lib/duration';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { setPendingBattle } from '@/lib/pending-battle';
import { recall, remember } from '@/lib/remember';
import { useSession } from '@/lib/session';
import { isVipActive, multiAttackCount } from '@/lib/vip';
import { colors } from '@/theme';

// Each trip into a zone gets its own number, so the zone screen starts fresh each time,
// as a new page does on the web (the screen itself stays mounted between trips).
const newVisit = () => String(Date.now());

// The web's planet (apps/web/src/app/(player)/[locale]/zones/page.tsx): lands as wedges around the Core.
const SIZE = 400;
const CENTER = SIZE / 2;
const OUTER_R = 135;
const INNER_R = 46;
const LABEL_R = OUTER_R + 26;
const WEDGE_GAP_DEG = 2;
const CORE_ID = '__core__';

function polarToXY(r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}
function wedgePath(startDeg: number, endDeg: number): string {
  const os = polarToXY(OUTER_R, startDeg);
  const oe = polarToXY(OUTER_R, endDeg);
  const ie = polarToXY(INNER_R, endDeg);
  const is = polarToXY(INNER_R, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${os.x} ${os.y} A ${OUTER_R} ${OUTER_R} 0 ${large} 1 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${INNER_R} ${INNER_R} 0 ${large} 0 ${is.x} ${is.y} Z`;
}
function arcPath(r: number, startDeg: number, endDeg: number): string {
  const s = polarToXY(r, startDeg);
  const e = polarToXY(r, endDeg);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${endDeg - startDeg > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

export default function ZonesScreen() {
  const { profile, refresh: refreshProfile } = useSession();
  const { width } = useWindowDimensions();
  const [zones, setZones] = useState<ZoneDto[] | null>(null);
  const [bosses, setBosses] = useState<BossDto[] | null>(null);
  const [core, setCore] = useState<CoreStateDto | null>(null);
  const [, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPentiliId, setSelectedPentiliId] = useState<string | null>(null);
  const [attacking, setAttacking] = useState(false);
  const [attackError, setAttackError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const multiCount = multiAttackCount(profile);

  async function load() {
    await Promise.all([
      getZones()
        .then((res) => {
          setZones(res);
          setSelectedId((current) => {
            if (current) return current;
            const remembered = recall('zones.selected');
            if (remembered === CORE_ID || res.some((z) => z.id === remembered && z.unlocked)) return remembered;
            return res.find((z) => z.unlocked)?.id ?? res[0]?.id ?? null;
          });
        })
        .catch(() => setError(t('zones.loadError'))),
      getBossFormations()
        .then((res) => setBosses(res.bosses))
        .catch(() => undefined),
      getCoreState()
        .then(setCore)
        .catch(() => undefined),
    ]);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const zone = zones?.find((z) => z.id === selectedId);
    if (!zone) {
      setSelectedPentiliId(null);
      return;
    }
    const remembered = recall(`lastPentili:${zone.id}`);
    setSelectedPentiliId(remembered && zone.pentiliPreview.some((p) => p.id === remembered) ? remembered : null);
  }, [selectedId, zones]);

  useEffect(() => {
    if (selectedId) remember('zones.selected', selectedId);
  }, [selectedId]);

  const coreOpen = core?.status === 'OPEN';
  const coreEnded = core?.status === 'ENDED';
  useEffect(() => {
    if (!coreOpen) return;
    const clock = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(clock);
  }, [coreOpen]);
  const coreSecondsLeft = coreOpen && core?.endsAt ? Math.max(0, Math.ceil((new Date(core.endsAt).getTime() - Date.now()) / 1000)) : 0;
  const coreWinner = coreEnded ? (core?.standings[0] ?? null) : null;
  const coreWinnerLabel = coreWinner ? `[${coreWinner.clanTag}] ${coreWinner.clanName}` : null;

  const selected = zones?.find((z) => z.id === selectedId) ?? null;
  const selectedBoss = selected ? (bosses?.find((b) => b.zoneId === selected.id) ?? null) : null;
  const openFormationCount = selectedBoss?.formations.filter((f) => f.status === 'OPEN').length ?? 0;
  const step = 360 / Math.max(1, zones?.length ?? 1);
  const planetSize = Math.min(width - 24, 384);

  async function attackFromPlanet(zoneId: string, pentiliId: string, multi = false) {
    setAttackError(null);
    setAttacking(true);
    try {
      const reports = multi ? (await attackPentiliMulti(pentiliId)).reports : [await attackPentili(pentiliId)];
      refreshProfile();
      setPendingBattle(pentiliId, reports);
      router.navigate({ pathname: '/zone/[zoneId]', params: { zoneId, pentili: pentiliId, visit: newVisit() } });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EXPEDITION_IN_PROGRESS') setAttackError(t('pve.expeditionInProgress'));
      else if (err instanceof ApiError && err.status === 400) setAttackError(t('pve.notEnoughEnergy'));
      else setAttackError(t('pve.attackError'));
    } finally {
      setAttacking(false);
    }
  }

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
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.text, marginBottom: 4 }}>{t('zones.title')}</Text>
      <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 24 }}>{t('zones.selectHint')}</Text>
      {error && <Text style={{ color: '#f87171', marginBottom: 16 }}>{error}</Text>}

      {zones && (
        <View style={{ alignItems: 'center', gap: 24 }}>
          <Svg width={planetSize} height={planetSize} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <Defs>
              {zones.map((zone) => (
                <ClipPath key={zone.id} id={`wedge-${zone.id}`}>
                  <Path d={wedgePath((zone.order - 1) * step + WEDGE_GAP_DEG / 2, zone.order * step - WEDGE_GAP_DEG / 2)} />
                </ClipPath>
              ))}
              <ClipPath id="core-clip">
                <Circle cx={CENTER} cy={CENTER} r={INNER_R} />
              </ClipPath>
            </Defs>

            {zones.map((zone) => {
              const startDeg = (zone.order - 1) * step + WEDGE_GAP_DEG / 2;
              const endDeg = zone.order * step - WEDGE_GAP_DEG / 2;
              const label = polarToXY(LABEL_R, (startDeg + endDeg) / 2);
              const words = t(zone.nameKey).split(' ');
              return (
                <G key={zone.id} onPress={() => setSelectedId(zone.id)}>
                  <SvgImage
                    href={{ uri: assetUrl(zone.iconAssetId) }}
                    x={CENTER - OUTER_R}
                    y={CENTER - OUTER_R}
                    width={OUTER_R * 2}
                    height={OUTER_R * 2}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#wedge-${zone.id})`}
                    opacity={zone.unlocked ? 1 : 0.35}
                  />
                  <SvgText x={label.x} y={label.y} textAnchor="middle" fontSize={9} fontWeight="600" fill={zone.unlocked ? colors.text : colors.textFaint}>
                    {words.map((word, i) => (
                      <TSpan key={i} x={label.x} dy={i === 0 ? -((words.length - 1) * 5) + 3 : 10}>
                        {word.toUpperCase()}
                      </TSpan>
                    ))}
                  </SvgText>
                </G>
              );
            })}

            <G onPress={() => setSelectedId(CORE_ID)}>
              <SvgImage
                href={{ uri: assetUrl('zones.core') }}
                x={CENTER - INNER_R}
                y={CENTER - INNER_R}
                width={INNER_R * 2}
                height={INNER_R * 2}
                preserveAspectRatio="xMidYMid slice"
                clipPath="url(#core-clip)"
                opacity={coreOpen || coreEnded ? 0.8 : 0.35}
              />
              <Rect x={CENTER - INNER_R + 6} y={coreWinnerLabel ? CENTER - 22 : CENTER - 16} width={(INNER_R - 6) * 2} height={coreWinnerLabel ? 44 : 32} rx={6} fill="rgba(0,0,0,0.45)" />
              <SvgText x={CENTER} y={coreWinnerLabel ? CENTER - 10 : CENTER - 6} textAnchor="middle" fontSize={10} fontWeight="600" fill="#ffffff">
                {t('zones.core').toUpperCase()}
              </SvgText>
              {coreWinnerLabel && (
                <>
                  <SvgText x={CENTER} y={CENTER + 3} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.8)">
                    {t('zones.coreTakenBy')}
                  </SvgText>
                  <SvgText x={CENTER} y={CENTER + 14} textAnchor="middle" fontSize={8} fontWeight="600" fill="#ffffff">
                    {coreWinnerLabel.length > 18 ? `${coreWinnerLabel.slice(0, 17)}…` : coreWinnerLabel}
                  </SvgText>
                </>
              )}
              {!coreOpen && !coreEnded && (
                <SvgText x={CENTER} y={CENTER + 10} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.8)">
                  {t('zones.coreComingSoon')}
                </SvgText>
              )}
              {coreOpen && (
                <SvgText x={CENTER} y={CENTER + 10} textAnchor="middle" fontSize={8} fontWeight="600" fill="#ffffff">
                  {formatDuration(coreSecondsLeft)}
                </SvgText>
              )}
            </G>

            <Circle cx={CENTER} cy={CENTER} r={OUTER_R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
            <Circle cx={CENTER} cy={CENTER} r={INNER_R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
            {zones.map((zone) => {
              const deg = (zone.order - 1) * step;
              const isEdge = selected && (zone.order === selected.order || zone.order === (selected.order % zones.length) + 1);
              const a = polarToXY(INNER_R, deg);
              const b = polarToXY(OUTER_R, deg);
              return <Line key={zone.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={isEdge ? colors.gold : 'rgba(255,255,255,0.15)'} strokeWidth={isEdge ? 3 : 1} />;
            })}
            {selected && (
              <>
                <Path d={arcPath(OUTER_R, (selected.order - 1) * step, selected.order * step)} fill="none" stroke={colors.gold} strokeWidth={3} />
                <Path d={arcPath(INNER_R, (selected.order - 1) * step, selected.order * step)} fill="none" stroke={colors.gold} strokeWidth={3} />
              </>
            )}
            {selectedId === CORE_ID && <Circle cx={CENTER} cy={CENTER} r={INNER_R} fill="none" stroke={colors.gold} strokeWidth={3} />}
          </Svg>

          {selected && (
            <View style={{ width: '100%', borderRadius: 8, borderWidth: 1, borderColor: colors.panelBorder, overflow: 'hidden' }}>
              <ZoneBackdrop uri={assetUrl(selected.iconAssetId)} />
              <View style={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1, alignItems: 'flex-start', gap: 4 }}>
                    <Chip text={t(selected.nameKey)} strong />
                    {!selected.unlocked && <Chip text={`${t('zones.unlocksAtLevel')} ${selected.unlockLevel}`} dim />}
                  </View>
                  {selected.unlocked ? (
                    <ActionButton label={t('zones.enter')} onPress={() => router.navigate({ pathname: '/zone/[zoneId]', params: { zoneId: selected.id, visit: newVisit() } })} />
                  ) : (
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{t('zones.locked')}</Text>
                  )}
                </View>

                {selected.pentiliPreview.length > 0 && (
                  <View pointerEvents={selected.unlocked ? 'auto' : 'none'} style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 12 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }}>
                      {selected.pentiliPreview.map((pentili) => {
                        const picked = pentili.id === selectedPentiliId;
                        return (
                          <Pressable
                            key={pentili.id}
                            onPress={() => {
                              setSelectedPentiliId(pentili.id);
                              remember(`lastPentili:${selected.id}`, pentili.id);
                            }}
                            style={{ width: '49%', alignItems: 'center', gap: 4, borderRadius: 6, borderWidth: 1, padding: 6, borderColor: picked ? colors.gold : 'transparent', backgroundColor: picked ? 'rgba(197,168,115,0.2)' : 'transparent' }}
                          >
                            <AssetImage assetId={pentili.iconAssetId} size={48} label={t(pentili.nameKey)} />
                            <Chip text={`${t(pentili.nameKey)} (Lv. ${pentili.level})`} small />
                            <Chip text={`HP ${formatNumber(pentili.maxHp)} · ATK ${formatNumber(pentili.attack)} · DEF ${formatNumber(pentili.defense)}`} tiny />
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
                      <ActionButton
                        style={{ flex: 1 }}
                        disabled={!selectedPentiliId || attacking}
                        label={attacking ? '…' : selectedPentiliId ? t('pve.attack') : t('pve.chooseOpponent')}
                        onPress={() => selectedPentiliId && attackFromPlanet(selected.id, selectedPentiliId)}
                      />
                      {isVipActive(profile) && (
                        <ActionButton
                          tone="vip"
                          disabled={!selectedPentiliId || attacking || multiCount < 2}
                          label={t('pve.attackMulti', { count: multiCount >= 2 ? multiCount : (profile?.vipMultiAttackCount ?? 3) })}
                          onPress={() => selectedPentiliId && attackFromPlanet(selected.id, selectedPentiliId, true)}
                        />
                      )}
                    </View>
                    {selectedPentiliId && <EnergyRefill profile={profile} onRefilled={refreshProfile} />}
                    {attackError && <Text style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: colors.danger }}>{attackError}</Text>}
                  </View>
                )}

                {selectedBoss && (
                  <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 12 }}>
                    <Pressable
                      disabled={!selectedBoss.unlocked || !selected.unlocked}
                      onPress={() => router.navigate({ pathname: '/zone/[zoneId]', params: { zoneId: selected.id, boss: '1', visit: newVisit() } })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(197,168,115,0.5)', backgroundColor: colors.well, padding: 10, opacity: selectedBoss.unlocked && !selected.unlocked ? 0.5 : 1 }}
                    >
                      <AssetImage assetId={selectedBoss.iconAssetId} size={80} label={t(selectedBoss.nameKey)} dimmed={!selectedBoss.unlocked} />
                      <View style={{ flex: 1, gap: 2, opacity: selectedBoss.unlocked ? 1 : 0.6 }}>
                        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', color: colors.gold }}>
                          {t(selectedBoss.nameKey)}
                        </Text>
                        <Text style={{ fontSize: 10, color: colors.textMuted }}>HP {formatNumber(selectedBoss.maxHp)}</Text>
                        <Text style={{ fontSize: 10, color: colors.textMuted }}>
                          {t('bosses.attack')} {formatNumber(selectedBoss.attack)}
                        </Text>
                        <Text style={{ fontSize: 10, color: colors.textMuted }}>
                          {t('bosses.defense')} {formatNumber(selectedBoss.defense)}
                        </Text>
                        <Text style={{ fontSize: 10, color: colors.textFaint }}>
                          {selectedBoss.unlocked
                            ? openFormationCount > 0
                              ? t('zones.bossOpenFormations', { count: openFormationCount })
                              : t('zones.bossNoFormations')
                            : t('bosses.locked', { level: selectedBoss.minLevel })}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          )}

          {selectedId === CORE_ID && (
            <View style={{ width: '100%', borderRadius: 8, borderWidth: 1, borderColor: colors.panelBorder, overflow: 'hidden' }}>
              <ZoneBackdrop uri={assetUrl('zones.core')} />
              <View style={{ minHeight: 120, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, alignItems: 'flex-start', gap: 4 }}>
                  <Chip text={t('zones.core')} strong />
                  {!coreOpen && !coreEnded && <Chip text={t('zones.coreComingSoon')} dim />}
                  {coreWinnerLabel && <Chip text={t('zones.coreTakenByClan', { clan: coreWinnerLabel })} />}
                  {coreOpen && (
                    <>
                      <Chip text={t('zones.coreTimeLeft', { time: formatDuration(coreSecondsLeft) })} gold />
                      <Chip text={t('zones.coreCallToAction')} />
                    </>
                  )}
                </View>
                {coreOpen && <ActionButton tone="vip" label={t('zones.enterCore')} onPress={() => router.navigate('/core')} />}
                {coreEnded && <ActionButton label={t('zones.coreStandings')} onPress={() => router.navigate('/core')} />}
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

/** A land's art behind its card, darkening toward the bottom so the content stays readable. */
export function ZoneBackdrop({ uri }: { uri: string }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="disk" />
      <LinearGradient colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
    </View>
  );
}

function Chip({ text, strong, dim, small, tiny, gold }: { text: string; strong?: boolean; dim?: boolean; small?: boolean; tiny?: boolean; gold?: boolean }) {
  return (
    <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text
        style={{
          fontSize: tiny ? 9 : small ? 10 : strong ? 15 : 12,
          fontWeight: strong ? '500' : '400',
          color: gold ? colors.gold : dim ? 'rgba(255,255,255,0.7)' : tiny ? 'rgba(255,255,255,0.8)' : '#ffffff',
          textAlign: small || tiny ? 'center' : 'left',
        }}
      >
        {text}
      </Text>
    </View>
  );
}
