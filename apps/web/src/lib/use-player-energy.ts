'use client';

import type { PlayerProfileDto } from '@pentilius/shared';
import { useEffect, useState } from 'react';
import { getProfile } from './api-client';

/**
 * Shared source of truth for the player's current Action Energy across every
 * energy-gated action (PvE, PvP, Bosses, Clan War). Call `refreshProfile()`
 * right after any action that might spend energy — success or failure —
 * so an attack/join button's disabled state never lags behind the server.
 */
export function usePlayerEnergy() {
  const [profile, setProfile] = useState<PlayerProfileDto | null>(null);

  async function refreshProfile() {
    try {
      setProfile(await getProfile());
    } catch {
      // Transient fetch failure — the page's own load() already surfaces a load error.
    }
  }

  useEffect(() => {
    refreshProfile();
  }, []);

  // Re-fetch once, exactly when the next Action Energy point is due, so an
  // energy-gated button's disabled state self-corrects without continuous
  // polling (same pattern as GameLayout's TopBar energy bar).
  useEffect(() => {
    if (!profile?.energy.nextRegenAt) return;
    const delayMs = new Date(profile.energy.nextRegenAt).getTime() - Date.now() + 1000;
    if (delayMs <= 0) return;
    const timeout = setTimeout(refreshProfile, delayMs);
    return () => clearTimeout(timeout);
  }, [profile?.energy.nextRegenAt]);

  return { profile, refreshProfile };
}
