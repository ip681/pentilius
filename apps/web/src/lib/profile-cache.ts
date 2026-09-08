import type { PlayerProfileDto } from '@pentilius/shared';

const PROFILE_CACHE_KEY = 'pentilius.cachedProfile';

// Shown optimistically the instant the layout mounts, before the real
// /player/profile fetch resolves — the logo has no such round-trip to wait
// on, which is why it used to appear instantly while every profile-dependent
// icon popped in a beat later. Always overwritten by the real fetch shortly
// after; never treated as authoritative.
export function getCachedProfile(): PlayerProfileDto | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PlayerProfileDto) : null;
  } catch {
    return null;
  }
}

export function setCachedProfile(profile: PlayerProfileDto): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // Storage full/unavailable — this cache is a pure display optimization, safe to skip.
  }
}

export function clearCachedProfile(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PROFILE_CACHE_KEY);
}
