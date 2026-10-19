import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { DailyStreakDto, DailyTaskDto, DailyTasksDto } from '@pentilius/shared';
import { AssetImage } from '@/components/AssetImage';
import { ClaimButton, ClaimedSection, ClaimedText, ProgressLine, RewardLine, rowStyle, SubHeading } from '@/components/RewardRows';
import { claimDailyTask, getDailyTasks } from '@/lib/api';
import { formatDuration } from '@/lib/duration';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

/** Daily tasks (the web's DailyTasksPanel): tasks, the all-done bonus, the streak. */
export function DailyTasksPanel({ onChanged }: { onChanged?: () => void }) {
  const [data, setData] = useState<DailyTasksDto | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = () => getDailyTasks().then(setData).catch(() => undefined);
  useEffect(() => {
    load();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);
  const secondsToReset = data ? Math.max(0, Math.ceil((new Date(data.resetAt).getTime() - now) / 1000)) : null;
  useEffect(() => {
    if (secondsToReset === 0) setTimeout(load, 1500);
  }, [secondsToReset === 0]);

  async function claim(key: string) {
    setBusyKey(key);
    try {
      setData(await claimDailyTask(key));
      onChanged?.();
    } catch {
      load();
    } finally {
      setBusyKey(null);
    }
  }

  const openTasks = (data?.tasks ?? []).filter((task) => !task.claimed).sort((a, b) => Number(b.completed) - Number(a.completed));
  const claimedTasks = (data?.tasks ?? []).filter((task) => task.claimed);

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t('dailyTasks.title')}</Text>
        {secondsToReset !== null && <Text style={{ fontSize: 11, color: colors.textFaint }}>{t('dailyTasks.resetsIn', { time: formatDuration(secondsToReset) })}</Text>}
      </View>
      {!data && <Text style={{ fontSize: 12, color: colors.textFaint }}>…</Text>}
      {data && (
        <>
          {openTasks.map((task) => (
            <TaskRow key={task.key} task={task} busy={busyKey === task.key} onClaim={() => claim(task.key)} />
          ))}
          {openTasks.length === 0 && (
            <View style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentBg, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, color: colors.text }}>{t('dailyTasks.allClaimed')}</Text>
            </View>
          )}
          <ClaimedSection count={claimedTasks.length}>
            {claimedTasks.map((task) => (
              <TaskRow key={task.key} task={task} busy={false} onClaim={() => undefined} />
            ))}
          </ClaimedSection>

          <SubHeading divider>{t('dailyTasks.allDoneHeading')}</SubHeading>
          <AllDoneRow allDone={data.allDone} busy={busyKey === 'ALL_DONE'} onClaim={() => claim('ALL_DONE')} />

          <SubHeading divider>{t('dailyTasks.streak.heading')}</SubHeading>
          <StreakRow streak={data.streak} busy={busyKey === 'STREAK'} onClaim={() => claim('STREAK')} />
        </>
      )}
    </View>
  );
}

function TaskRow({ task, busy, onClaim }: { task: DailyTaskDto; busy: boolean; onClaim: () => void }) {
  return (
    <View style={rowStyle(task.claimed ? 'claimed' : task.completed ? 'ready' : 'open')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Text style={{ fontSize: 12, color: task.claimed ? colors.textFaint : colors.text, textDecorationLine: task.claimed ? 'line-through' : 'none' }}>
          {t(`dailyTasks.types.${task.type}`, { count: task.target })}
        </Text>
        <RewardLine reward={task.reward} />
      </View>
      {task.claimed ? <ClaimedText /> : task.completed ? <ClaimButton label={t('dailyTasks.claim')} busy={busy} onPress={onClaim} wide /> : <ProgressLine share={task.progress / task.target} text={`${task.progress}/${task.target}`} />}
    </View>
  );
}

function Dots({ filled, total, color }: { filled: number; total: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: i < filled ? color : colors.wellBorder, backgroundColor: i < filled ? color : 'transparent' }} />
      ))}
    </View>
  );
}

function StreakRow({ streak, busy, onClaim }: { streak: DailyStreakDto; busy: boolean; onClaim: () => void }) {
  return (
    <View style={rowStyle(streak.ready ? 'ready' : 'open')}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ width: 64, fontSize: 11, color: colors.text }}>{t('dailyTasks.streak.title')}</Text>
            <Dots filled={streak.days} total={streak.target} color={colors.accent} />
            <Text style={{ fontSize: 11, color: colors.text }}>
              {streak.days}/{streak.target}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ width: 64, fontSize: 11, color: colors.text }}>{t('dailyTasks.streak.misses')}</Text>
            <Dots filled={streak.allowedMisses - streak.missesUsed} total={streak.allowedMisses} color={colors.textMuted} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AssetImage assetId={`items.${streak.rewardItemKey}.icon`} size={40} label="" hideFallback />
          {streak.ready && <ClaimButton label={t('dailyTasks.claim')} busy={busy} onPress={onClaim} />}
        </View>
      </View>
      <Text style={{ marginTop: 6, fontSize: 10, color: colors.text }}>
        {streak.restarted ? `${t('dailyTasks.streak.restarted')} ` : ''}
        {t('dailyTasks.streak.hint', { days: streak.target, misses: streak.allowedMisses })}
      </Text>
    </View>
  );
}

function AllDoneRow({ allDone, busy, onClaim }: { allDone: DailyTasksDto['allDone']; busy: boolean; onClaim: () => void }) {
  const itemName = t(`items.${allDone.bonusItemKey}.name`);
  return (
    <View style={rowStyle(allDone.claimed ? 'claimed' : allDone.completed ? 'ready' : 'open')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: colors.text, marginBottom: 6 }}>{t('dailyTasks.allDoneBonus', { item: itemName })}</Text>
          {allDone.claimed ? (
            <ClaimedText />
          ) : allDone.completed ? (
            <ClaimButton label={t('dailyTasks.claim')} busy={busy} onPress={onClaim} wide />
          ) : (
            <ProgressLine share={allDone.target > 0 ? allDone.progress / allDone.target : 0} text={`${allDone.progress}/${allDone.target}`} />
          )}
        </View>
        <AssetImage assetId={`items.${allDone.bonusItemKey}.icon`} size={40} label="" hideFallback />
      </View>
    </View>
  );
}
