'use client';

import type { NotificationsDto, NotificationTimerDto, NotificationType, PlayerProfileDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { notifyNotificationsChanged } from '@/lib/notifications-events';
import { devicePushActive, getDeviceState } from '@/lib/push';

const SHOWN_KEY = 'pentilius.notifications.shown';
const LAST_ATTACK_KEY = 'pentilius.notifications.lastAttack';
const TOAST_MS = 8000;

const TARGET: Record<NotificationType, string> = {
  ENERGY_FULL: '/zones',
  CONSTRUCTION_DONE: '/base',
  RESEARCH_DONE: '/research',
  EXPEDITION_DONE: '/expeditions',
  PVP_ATTACKED: '/reports',
  BOSS_BATTLE_DONE: '/bosses',
};

interface Toast {
  id: string;
  title: string;
  body: string;
  href: string;
}

function readShown(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SHOWN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function markShown(tag: string): boolean {
  const shown = readShown();
  if (shown.has(tag)) return false;
  shown.add(tag);
  try {
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...shown].slice(-50)));
  } catch {
    // ignore
  }
  return true;
}

/**
 * Timed and event notifications while the game is open (owner decision,
 * 2026-10-13): an in-game notice when the player is looking, a browser
 * notification when the tab is in the background. With Web Push on this
 * device, the background case is left to the push (no doubles).
 */
export function NotificationCenter({ notifications, profile }: { notifications: NotificationsDto | null; profile: PlayerProfileDto | null }) {
  const t = useTranslations();
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);

  function show(tag: string, type: NotificationType, title: string, body: string, path?: string | null) {
    if (!markShown(tag)) return;
    if (document.visibilityState === 'visible') {
      const toast = { id: tag, title, body, href: path ?? TARGET[type] };
      setToasts((list) => [...list.slice(-3), toast]);
      setTimeout(() => setToasts((list) => list.filter((item) => item.id !== tag)), TOAST_MS);
    } else if (getDeviceState() === 'on' && !devicePushActive()) {
      try {
        new Notification(title, { body, tag, icon: '/logo_255x255.png' });
      } catch {
        // Some browsers only allow notifications from a service worker — skip.
      }
    }
  }

  function timerText(timer: NotificationTimerDto): { title: string; body: string } {
    const name = timer.nameKey ? t(timer.nameKey) : '';
    switch (timer.type) {
      case 'ENERGY_FULL':
        return { title: t('notifications.energyFull.title'), body: t('notifications.energyFull.body') };
      case 'CONSTRUCTION_DONE':
        return { title: t('notifications.constructionDone.title'), body: t('notifications.constructionDone.body', { name, level: timer.level ?? 0 }) };
      case 'RESEARCH_DONE':
        return { title: t('notifications.researchDone.title'), body: t('notifications.researchDone.body', { name, level: timer.level ?? 0 }) };
      case 'BOSS_BATTLE_DONE':
        return { title: t('notifications.bossBattleDone.title'), body: t('notifications.bossBattleDone.body', { name }) };
      default:
        return { title: t('notifications.expeditionDone.title'), body: t('notifications.expeditionDone.body', { name }) };
    }
  }

  // Timers: one timeout per upcoming end; just-ended ones fire at once (deduped by tag).
  // Energy comes from the profile, which refreshes after every action; the
  // other timers from the per-page check (refreshed after timed actions).
  const energyFullAt = profile?.energy.fullAt ?? null;
  useEffect(() => {
    if (!notifications) return;
    const timers: NotificationTimerDto[] = [
      ...notifications.timers.filter((timer) => timer.type !== 'ENERGY_FULL'),
      ...(energyFullAt ? [{ type: 'ENERGY_FULL' as const, at: energyFullAt, nameKey: null, level: null, path: null }] : []),
    ];
    const handles = timers
      .filter((timer) => notifications.settings[timer.type])
      .map((timer) => {
        const delay = Math.max(0, new Date(timer.at).getTime() - Date.now());
        if (delay > 24 * 60 * 60 * 1000) return null;
        return setTimeout(() => {
          const text = timerText(timer);
          show(`${timer.type}:${timer.path ?? ''}:${timer.at}`, timer.type, text.title, text.body, timer.path);
          // Refresh the timer list (and the dots) after something ended.
          notifyNotificationsChanged();
        }, delay);
      });
    return () => handles.forEach((handle) => handle && clearTimeout(handle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, energyFullAt]);

  // Keep the push service worker current: browsers re-check it only rarely,
  // so an update (new icon, texts) would otherwise lag for a day.
  useEffect(() => {
    if (!devicePushActive() || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch(() => undefined);
  }, []);

  // PvP attack: shown once per new defense. The first check only remembers the latest.
  useEffect(() => {
    const attack = notifications?.lastAttack;
    if (!attack || !notifications.settings.PVP_ATTACKED) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(LAST_ATTACK_KEY);
      localStorage.setItem(LAST_ATTACK_KEY, attack.at);
    } catch {
      return;
    }
    if (seen === null || new Date(attack.at) <= new Date(seen)) return;
    show(
      `PVP_ATTACKED:${attack.at}`,
      'PVP_ATTACKED',
      t('notifications.pvpAttacked.title'),
      t(attack.defenderWon ? 'notifications.pvpAttacked.bodyWon' : 'notifications.pvpAttacked.bodyLost', { attacker: attack.attacker }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications?.lastAttack?.at]);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 right-3 z-50 flex w-[min(92vw,320px)] flex-col gap-2 md:bottom-4">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => {
            setToasts((list) => list.filter((item) => item.id !== toast.id));
            router.push(toast.href);
          }}
          className="pointer-events-auto rounded-lg border border-accent bg-panel px-4 py-3 text-left shadow-lg hover:bg-accentBgHover"
        >
          <p className="text-sm font-semibold">{toast.title}</p>
          <p className="text-xs text-textMuted">{toast.body}</p>
        </button>
      ))}
    </div>
  );
}
