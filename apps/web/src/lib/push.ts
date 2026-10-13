'use client';

import { subscribePush, unsubscribePush } from './api-client';

// Device-level browser notification state (owner decision, 2026-10-13).
// "on" here means the player switched notifications on for THIS browser;
// which kinds they get is the server-side setting shared by all devices.
const DEVICE_FLAG = 'pentilius.notifications.device';

export type DeviceNotificationState = 'unsupported' | 'blocked' | 'off' | 'on';
// Why Web Push couldn't be set up on this device (shown in Settings).
export type PushFailure = 'no-server-key' | 'unsupported' | 'subscribe-failed' | 'server-failed' | null;
const PUSH_FAILURE = 'pentilius.notifications.pushFailure';

export function getPushFailure(): PushFailure {
  try {
    return (localStorage.getItem(PUSH_FAILURE) as PushFailure) ?? null;
  } catch {
    return null;
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function pushSupported(): boolean {
  return notificationsSupported() && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function getDeviceState(): DeviceNotificationState {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    return Notification.permission === 'granted' && localStorage.getItem(DEVICE_FLAG) !== null ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/** True when this browser receives Web Push — then the open game doesn't show its own OS notifications (no doubles). */
export function devicePushActive(): boolean {
  try {
    return localStorage.getItem(DEVICE_FLAG) === 'push';
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/**
 * Asks for permission (must run from a click), then subscribes this browser to
 * Web Push when the server has keys; otherwise falls back to notifications
 * only while the game is open.
 */
export async function enableDeviceNotifications(pushPublicKey: string | null): Promise<DeviceNotificationState> {
  if (!notificationsSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';

  let mode = 'open-only';
  let failure: PushFailure = null;
  if (!pushPublicKey) {
    failure = 'no-server-key';
  } else if (!pushSupported()) {
    failure = 'unsupported';
  } else {
    let subscription: PushSubscription | null = null;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(pushPublicKey) as BufferSource }));
    } catch (error) {
      // e.g. iPhone outside the home screen, or Brave with push messaging off.
      console.warn('Web Push subscribe failed', error);
      failure = 'subscribe-failed';
    }
    if (subscription) {
      try {
        const json = subscription.toJSON();
        await subscribePush(subscription.endpoint, json.keys?.p256dh ?? '', json.keys?.auth ?? '');
        mode = 'push';
      } catch (error) {
        console.warn('Saving the push subscription failed', error);
        failure = 'server-failed';
      }
    }
  }
  try {
    localStorage.setItem(DEVICE_FLAG, mode);
    if (failure) localStorage.setItem(PUSH_FAILURE, failure);
    else localStorage.removeItem(PUSH_FAILURE);
  } catch {
    // Storage blocked — the state just isn't remembered.
  }
  return 'on';
}

/**
 * Session over without a working token (expired): drop this browser's push
 * subscription locally. The server learns it's gone on its next send (410)
 * and deletes it, so the next person on this browser gets nothing of ours.
 */
export async function forgetDevicePush(): Promise<void> {
  try {
    localStorage.removeItem(DEVICE_FLAG);
    localStorage.removeItem(PUSH_FAILURE);
  } catch {
    // ignore
  }
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js').catch(() => undefined);
  const subscription = await registration?.pushManager.getSubscription().catch(() => null);
  await subscription?.unsubscribe().catch(() => undefined);
}

export async function disableDeviceNotifications(): Promise<void> {
  try {
    localStorage.removeItem(DEVICE_FLAG);
    localStorage.removeItem(PUSH_FAILURE);
  } catch {
    // ignore
  }
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await unsubscribePush(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
  }
}
