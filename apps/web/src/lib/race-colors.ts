import type { Race } from '@pentilius/shared';

// A race-locked item's square gets a tint of its race's brand color
// (instructions/PRODUCT_SPEC.md) instead of the plain well background — still
// darker than the full brand color, but strong enough to actually read at a
// glance against the icon and dark theme. Shared between the Robot inventory
// grid and the Market's listings/picker.
export const RACE_BG_CLASS: Record<Race, string> = {
  LUXARI: 'bg-raceLuxari/20',
  VORLUN: 'bg-raceVorlun/20',
  ZARYTH: 'bg-raceZaryth/20',
  THALION: 'bg-raceThalion/20',
  NEXAR: 'bg-raceNexar/20',
};
