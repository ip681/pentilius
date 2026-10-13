'use client';

import { useEffect, useRef } from 'react';

// Long timers are capped so setTimeout never overflows (~24.8 days max); the
// page simply re-arms after the next load.
const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * One refresh mechanism for every page (owner decision, 2026-10-13), to keep
 * the server load low:
 * 1. load once when the page opens;
 * 2. nothing runs while the tab is hidden; coming back refreshes at once;
 * 3. `intervalMs` — only for data other players can change, and only while
 *    the tab is visible (null/omitted = no periodic refresh);
 * 4. `refreshAt` — moments when something is known to change (a construction,
 *    research or expedition ends): one refresh just after the earliest.
 * Pages still call their own load() right after the player's own actions.
 */
export function useRefresh(
  load: () => void,
  options: {
    intervalMs?: number | null;
    refreshAt?: (string | null | undefined)[];
    // Restarts the cycle when it changes (e.g. another chat was opened); null/false pauses it.
    key?: string | null;
    enabled?: boolean;
    // false when the page does its own first load (e.g. with extra side effects).
    loadOnStart?: boolean;
  } = {},
) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const { intervalMs = null, refreshAt = [], key = '', enabled = true, loadOnStart = true } = options;

  useEffect(() => {
    if (!enabled || key === null) return;
    const run = () => loadRef.current();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (intervalMs && !timer) timer = setInterval(run, intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        run();
        start();
      } else {
        stop();
      }
    };

    if (loadOnStart) run();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, key, enabled]);

  // The earliest future moment among refreshAt — re-armed whenever the list changes.
  const nextAt = refreshAt
    .map((iso) => (iso ? new Date(iso).getTime() : NaN))
    .filter((time) => Number.isFinite(time) && time > Date.now())
    .sort((a, b) => a - b)[0];

  useEffect(() => {
    if (nextAt === undefined || !enabled) return;
    const delay = Math.min(nextAt - Date.now() + 1000, MAX_TIMEOUT_MS);
    const timeout = setTimeout(() => {
      // A hidden tab refreshes when it becomes visible again instead.
      if (document.visibilityState === 'visible') loadRef.current();
    }, delay);
    return () => clearTimeout(timeout);
  }, [nextAt, enabled]);
}
