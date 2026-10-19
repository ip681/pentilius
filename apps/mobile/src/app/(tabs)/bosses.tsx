import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { BossFormationDto, BossFormationsResponseDto } from '@pentilius/shared';
import { BossFormationCard } from '@/components/BossFormationCard';
import { CheckRow, ConfirmButton } from '@/components/ConfirmButton';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ApiError, createBossFormation, getBossFormations, getMyClan, joinBossFormation, updateBossFormationVisibility } from '@/lib/api';
import { formatDuration } from '@/lib/duration';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useClock, useLive } from '@/lib/use-live';
import { colors } from '@/theme';

type Visibility = { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean };

// The web's Bosses page (apps/web/src/app/(player)/[locale]/bosses/page.tsx), as on a phone.
export default function BossesScreen() {
  const { profile } = useSession();
  const [data, setData] = useState<BossFormationsResponseDto | null>(null);
  const [inClan, setInClan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibilityDraft, setVisibilityDraft] = useState<Record<string, Visibility>>({});
  const now = useClock();
  const myRace = profile?.race ?? null;

  async function load() {
    try {
      const [formations, myClan] = await Promise.all([getBossFormations(), getMyClan()]);
      setData(formations);
      setInClan(myClan.clan !== null);
    } catch {
      setError(t('bosses.loadError'));
    }
  }
  // Other players fill formations — live, only while this screen is in view.
  useLive(load, 10_000);

  const draftFor = (bossKey: string) => visibilityDraft[bossKey] ?? { visibleToClanOnly: false, visibleToFriendsOnly: false };
  const setDraft = (bossKey: string, next: Visibility) => setVisibilityDraft((prev) => ({ ...prev, [bossKey]: next }));

  function errorMessage(err: unknown, bossMinLevel = 0): string {
    if (err instanceof ApiError && err.code) {
      const map: Record<string, string> = {
        LEVEL_TOO_LOW: t('bosses.errorLevelTooLow', { level: bossMinLevel }),
        NOT_IN_CLAN: t('bosses.errorNotInClan'),
        BOSS_FORMATION_COOLDOWN_ACTIVE: t('bosses.errorCooldownActive'),
        EXPEDITION_IN_PROGRESS: t('bosses.expeditionInProgress'),
        SLOT_ALREADY_FILLED: t('bosses.errorSlotFilled'),
        FORMATION_ALREADY_RESOLVED: t('bosses.errorAlreadyResolved'),
        VISIBILITY_EDIT_WINDOW_CLOSED: t('bosses.errorVisibilityLocked'),
      };
      if (map[err.code]) return map[err.code];
    }
    return t('bosses.actionError');
  }

  async function handleCreate(bossKey: string) {
    setError(null);
    try {
      await createBossFormation(bossKey, draftFor(bossKey));
      await load();
    } catch (err) {
      setError(errorMessage(err, data?.bosses.find((b) => b.key === bossKey)?.minLevel ?? 0));
    }
  }

  async function handleJoin(formationId: string) {
    setError(null);
    try {
      await joinBossFormation(formationId);
      await load();
    } catch (err) {
      setError(errorMessage(err, data?.bosses.find((b) => b.formations.some((f) => f.id === formationId))?.minLevel ?? 0));
    }
  }

  async function handleVisibilityToggle(formation: BossFormationDto, next: Visibility) {
    setError(null);
    try {
      await updateBossFormationVisibility(formation.id, next);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const cooldownMs = data?.nextActionAvailableAt ? new Date(data.nextActionAvailableAt).getTime() - now : 0;
  const onCooldown = cooldownMs > 0;

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
      <ScreenTitle title={t('bosses.title')} subtitle={t('bosses.subtitle')} />
      {onCooldown && (
        <Text style={{ marginTop: -16, marginBottom: 16, fontSize: 12, color: colors.gold }}>
          {t('bosses.cooldownActive')} {formatDuration(cooldownMs / 1000)}
        </Text>
      )}
      {error && <Text style={{ marginBottom: 16, color: colors.danger }}>{error}</Text>}

      <View style={{ gap: 24 }}>
        {data?.bosses.map((boss) => (
          <View key={boss.id} style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.panelBorder, backgroundColor: colors.panelHeader, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t(boss.nameKey)}</Text>
              <Text style={{ fontSize: 10, textTransform: 'uppercase', color: colors.textFaint }}>{t(boss.zoneNameKey)}</Text>
            </View>
            <View style={{ padding: 20 }}>
              {!boss.unlocked && <Text style={{ marginBottom: 12, fontSize: 12, color: colors.textMuted }}>{t('bosses.locked', { level: boss.minLevel })}</Text>}
              {/* Shown but inactive below the required level, like a locked zone. */}
              <View pointerEvents={boss.unlocked ? 'auto' : 'none'} style={{ opacity: boss.unlocked ? 1 : 0.4 }}>
                <Text style={{ marginBottom: 16, fontSize: 12, color: colors.textMuted }}>
                  HP {formatNumber(boss.maxHp)} · {t('bosses.attack')} {formatNumber(boss.attack)} · {t('bosses.defense')} {formatNumber(boss.defense)} · {t('bosses.xpReward')} {formatNumber(boss.xpReward)}
                </Text>
                <View style={{ marginBottom: 20, borderRadius: 4, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, padding: 12, gap: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>{t('bosses.createFormation')}</Text>
                  <CheckRow label={t('market.clanOnly')} checked={draftFor(boss.key).visibleToClanOnly} disabled={!inClan} onChange={(v) => setDraft(boss.key, { ...draftFor(boss.key), visibleToClanOnly: v })} />
                  <CheckRow label={t('market.friendsOnly')} checked={draftFor(boss.key).visibleToFriendsOnly} onChange={(v) => setDraft(boss.key, { ...draftFor(boss.key), visibleToFriendsOnly: v })} />
                  <ConfirmButton label={t('bosses.createFormation')} message={t('bosses.createConfirm')} onConfirm={() => handleCreate(boss.key)} disabled={onCooldown || !boss.unlocked} />
                </View>
                {boss.formations.length === 0 ? (
                  <Text style={{ fontSize: 12, color: colors.textFaint }}>{t('bosses.noFormations')}</Text>
                ) : (
                  <View style={{ gap: 12 }}>
                    {boss.formations.map((formation) => (
                      <BossFormationCard
                        key={formation.id}
                        formation={formation}
                        now={now}
                        myRace={myRace}
                        onCooldown={onCooldown}
                        onJoin={() => handleJoin(formation.id)}
                        onVisibilityToggle={(next) => handleVisibilityToggle(formation, next)}
                      />
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
