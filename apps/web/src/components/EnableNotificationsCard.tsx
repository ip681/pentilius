'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { getNotificationSettings } from '@/lib/api-client';
import { enableDeviceNotifications, getDeviceState } from '@/lib/push';

const SNOOZE_KEY = 'pentilius.notifications.promptSnoozedUntil';
const SNOOZE_DAYS = 7;

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

/**
 * Command Center invitation to turn notifications on (owner decision,
 * 2026-10-13) — so players don't have to find it in Settings. Shown only while
 * notifications are off on this device (not when blocked or unsupported);
 * "Not now" hides it for 7 days.
 */
export function EnableNotificationsCard() {
  const t = useTranslations();
  const [visible, setVisible] = useState(false);
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (getDeviceState() !== 'off' || snoozed()) return;
    setVisible(true);
    // Fetched up front: the browser's permission prompt must open straight from the click.
    getNotificationSettings()
      .then((res) => setPushKey(res.pushPublicKey))
      .catch(() => undefined);
  }, []);

  async function handleEnable() {
    setBusy(true);
    try {
      const state = await enableDeviceNotifications(pushKey);
      if (state === 'on') {
        setEnabled(true);
        setTimeout(() => setVisible(false), 4000);
      } else {
        setVisible(false);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleLater() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
    } catch {
      // Storage blocked — it just shows again next time.
    }
    setVisible(false);
  }

  if (!visible) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent bg-panel px-4 py-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{enabled ? t('dashboard.enableNotifications.enabled') : t('dashboard.enableNotifications.title')}</h3>
        {!enabled && <p className="text-xs text-textMuted">{t('dashboard.enableNotifications.body')}</p>}
      </div>
      {!enabled && (
        <div className="flex gap-2">
          <button type="button" onClick={handleLater} className="rounded-md border border-panelBorder px-3 py-1.5 text-[11px] uppercase text-textMuted hover:bg-accentBgHover">
            {t('dashboard.enableNotifications.later')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleEnable}
            className="rounded-md border border-accent bg-accentBg px-4 py-1.5 text-[11px] uppercase hover:bg-accentBgHover disabled:opacity-30"
          >
            {t('dashboard.enableNotifications.enable')}
          </button>
        </div>
      )}
    </div>
  );
}
