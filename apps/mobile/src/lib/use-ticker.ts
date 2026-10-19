import { useEffect, useRef, useState } from 'react';

/** Re-renders every second (countdowns), and calls onDue once each time one of `dueTimes` passes. */
export function useTicker(dueTimes: (string | null | undefined)[], onDue: () => void): void {
  const [, setTick] = useState(0);
  const fired = useRef(new Set<string>());
  const due = useRef(onDue);
  due.current = onDue;
  const key = dueTimes.filter(Boolean).join('|');

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((n) => n + 1);
      const now = Date.now();
      for (const time of key ? key.split('|') : []) {
        if (!fired.current.has(time) && new Date(time).getTime() <= now) {
          fired.current.add(time);
          due.current();
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [key]);
}
