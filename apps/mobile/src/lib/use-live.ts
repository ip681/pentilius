import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * The web's useRefresh for the app: loads when the screen comes into view and,
 * with an interval, keeps reloading only while the screen is in view and the
 * app is in front — tab screens stay mounted after you leave them, so a plain
 * setInterval would keep polling the server in the background.
 */
export function useLive(load: () => unknown, intervalMs?: number): void {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(false);
  const [active, setActive] = useState(AppState.currentState === 'active');

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      focusedRef.current = true;
      loadRef.current();
      return () => {
        setFocused(false);
        focusedRef.current = false;
      };
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const nowActive = state === 'active';
      setActive(nowActive);
      if (nowActive && focusedRef.current) loadRef.current();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!intervalMs || !focused || !active) return;
    const timer = setInterval(() => loadRef.current(), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, focused, active]);
}

/** A 1-second clock for countdowns — only while the screen is in view. */
export function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }, []),
  );
  return now;
}
