'use client';

import type { NotificationSettingsDto, NotificationType } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { getNotificationSettings, updateNotificationSettings } from '@/lib/api-client';
import { notifyNotificationsChanged } from '@/lib/notifications-events';
import { type DeviceNotificationState, devicePushActive, disableDeviceNotifications, enableDeviceNotifications, getDeviceState, getPushFailure } from '@/lib/push';

const TYPES: NotificationType[] = ['ENERGY_FULL', 'CONSTRUCTION_DONE', 'RESEARCH_DONE', 'EXPEDITION_DONE', 'PVP_ATTACKED'];

/**
 * Notifications in Settings (owner decision, 2026-10-13): switch browser
 * notifications on for this device, and choose which kinds to get (shared by
 * every device and, later, the mobile app).
 */
export function NotificationSettingsSection() {
  const t = useTranslations();
  const [settings, setSettings] = useState<NotificationSettingsDto | null>(null);
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceNotificationState>('off');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDevice(getDeviceState());
    getNotificationSettings()
      .then((res) => {
        setSettings(res.settings);
        setPushKey(res.pushPublicKey);
      })
      .catch(() => undefined);
  }, []);

  async function toggleDevice() {
    setBusy(true);
    try {
      if (device === 'on') {
        await disableDeviceNotifications();
        setDevice(getDeviceState());
      } else {
        setDevice(await enableDeviceNotifications(pushKey));
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleType(type: NotificationType) {
    if (!settings) return;
    const next = { ...settings, [type]: !settings[type] };
    setSettings(next);
    try {
      setSettings((await updateNotificationSettings(next)).settings);
      notifyNotificationsChanged();
    } catch {
      setSettings(settings);
    }
  }

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold">{t('notifications.settings.title')}</h2>
      <p className="mb-3 text-xs text-textMuted">{t('notifications.settings.intro')}</p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-wellBorder bg-well px-3 py-2 text-xs">
        <span>
          {device === 'on' ? t(devicePushActive() ? 'notifications.settings.device.onPush' : 'notifications.settings.device.onOpenOnly') : t(`notifications.settings.device.${device}`)}
          {device === 'on' && !devicePushActive() && getPushFailure() && (
            <span className="mt-0.5 block text-[10px] text-textFaint">{t(`notifications.settings.pushFailure.${getPushFailure()}`)}</span>
          )}
        </span>
        {(device === 'on' || device === 'off') && (
          <button
            type="button"
            disabled={busy}
            onClick={toggleDevice}
            className="rounded-md border border-accent bg-accentBg px-3 py-1 text-[11px] uppercase hover:bg-accentBgHover disabled:opacity-30"
          >
            {device === 'on' ? t('notifications.settings.turnOff') : t('notifications.settings.turnOn')}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {TYPES.map((type) => (
          <label key={type} className="flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" checked={settings?.[type] ?? true} disabled={!settings} onChange={() => toggleType(type)} className="accent-accent" />
            {t(`notifications.settings.types.${type}`)}
          </label>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-textFaint">{t('notifications.settings.note')}</p>
    </section>
  );
}
