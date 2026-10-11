import type { BattleReportDto } from '@pentilius/shared';

const STORAGE_KEY = 'pentilius.pendingPentiliBattle';

/**
 * Hands a just-fetched PvE battle result from the planet page's "Атакувай"
 * button to the zone page it navigates to next, so that page can render the
 * fight immediately instead of re-requesting it — the whole point (owner
 * decision, 2026-10-11) is firing the attack on click, before navigating,
 * so the player doesn't sit through "page loads → then the attack loads" as
 * two separate waits. sessionStorage (not a query param) because a full
 * BattleReportDto is too large/structured for a URL.
 */
export function setPendingBattle(pentiliId: string, report: BattleReportDto): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ pentiliId, report }));
  } catch {
    // Storage unavailable — the zone page's own fallback (show the Attack
    // button, let the player click it) still works fine without this.
  }
}

/** Reads and immediately clears the pending result — it's single-use, never replayed on a refresh or back-navigation. */
export function takePendingBattle(pentiliId: string): BattleReportDto | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as { pentiliId: string; report: BattleReportDto };
    return parsed.pentiliId === pentiliId ? parsed.report : null;
  } catch {
    return null;
  }
}
