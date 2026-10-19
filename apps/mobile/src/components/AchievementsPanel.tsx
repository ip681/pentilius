import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { AchievementDto, AchievementRewardDto, AchievementsDto } from '@pentilius/shared';
import { ClaimButton, ClaimedSection, ClaimedText, ProgressLine, RewardLine, rowStyle, SubHeading } from '@/components/RewardRows';
import { ApiError, claimAchievement, getAchievements } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

/** Season achievements and level rewards (the web's AchievementsPanel). */
export function AchievementsPanel({ onChanged }: { onChanged?: () => void }) {
  const [data, setData] = useState<AchievementsDto | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => getAchievements().then(setData).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);

  async function claim(key: string) {
    setBusyKey(key);
    setError(null);
    try {
      setData(await claimAchievement(key));
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'INVENTORY_FULL' ? t('achievements.inventoryFull') : t('achievements.claimError'));
      load();
    } finally {
      setBusyKey(null);
    }
  }

  const open = data ? data.achievements.filter((a) => !a.finished).sort((a, b) => Number(b.completed) - Number(a.completed)) : [];
  const finished = data ? data.achievements.filter((a) => a.finished) : [];
  const row = (a: AchievementDto) => (
    <RewardRow
      key={a.key}
      label={t(`achievements.items.${a.key}`, { count: formatNumber(a.target), set: a.setTier ? t(`achievements.sets.${a.setTier}`) : '' })}
      tierText={`(${a.tier}/${a.tierCount})`}
      reward={a.reward}
      progress={a.progress}
      target={a.target}
      completed={a.completed}
      finished={a.finished}
      busy={busyKey === a.tierKey}
      onClaim={() => claim(a.tierKey)}
    />
  );

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 4 }}>{t('achievements.title')}</Text>
      {error && <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>}
      {!data && <Text style={{ fontSize: 12, color: colors.textFaint }}>…</Text>}
      {data?.levelReward && (
        <>
          <SubHeading>{t('achievements.levelHeading')}</SubHeading>
          <RewardRow
            label={t('achievements.levelReward', { level: data.levelReward.level })}
            reward={data.levelReward.reward}
            progress={data.levelReward.xpPercent ?? 100}
            target={100}
            percentText
            completed={data.levelReward.reached}
            finished={false}
            busy={busyKey === data.levelReward.claimKey}
            onClaim={() => claim(data.levelReward!.claimKey)}
          />
        </>
      )}
      {open.length + finished.length > 0 && <SubHeading divider={!!data?.levelReward}>{t('achievements.listHeading')}</SubHeading>}
      {open.map(row)}
      {data && open.length === 0 && finished.length > 0 && (
        <View style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentBg, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, color: colors.text }}>{t('achievements.allFinished')}</Text>
        </View>
      )}
      <ClaimedSection count={finished.length}>{finished.map(row)}</ClaimedSection>
    </View>
  );
}

function RewardRow({
  label,
  tierText,
  percentText = false,
  reward,
  progress,
  target,
  completed,
  finished,
  busy,
  onClaim,
}: {
  label: string;
  tierText?: string;
  percentText?: boolean;
  reward: AchievementRewardDto;
  progress: number;
  target: number;
  completed: boolean;
  finished: boolean;
  busy: boolean;
  onClaim: () => void;
}) {
  const share = target > 0 ? progress / target : 0;
  return (
    <View style={rowStyle(finished ? 'claimed' : completed ? 'ready' : 'open')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: colors.text }}>
          {label} {tierText ? <Text style={{ fontSize: 10, color: colors.textFaint }}>{tierText}</Text> : null}
        </Text>
        <RewardLine reward={reward} />
      </View>
      {finished ? (
        <ClaimedText />
      ) : completed ? (
        <ClaimButton label={t('achievements.claim')} busy={busy} onPress={onClaim} wide />
      ) : (
        <ProgressLine share={share} text={percentText ? `${Math.round(share * 100)}%` : `${formatNumber(progress)}/${formatNumber(target)}`} />
      )}
    </View>
  );
}
