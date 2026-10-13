import type { PlayerProfileDto } from '@pentilius/shared';

/** VIP (owner decision, 2026-10-13) — mirrors the server's check; the server still decides. */
export function isVipActive(profile: Pick<PlayerProfileDto, 'vipUntil'> | null | undefined): boolean {
  return !!profile?.vipUntil && new Date(profile.vipUntil).getTime() > Date.now();
}

/** How many battles "Attack xN" would run now — 0 when not VIP; below 2 means the button is inactive. */
export function multiAttackCount(profile: PlayerProfileDto | null | undefined): number {
  if (!profile || !isVipActive(profile)) return 0;
  return Math.min(profile.vipMultiAttackCount, profile.energy.current);
}
