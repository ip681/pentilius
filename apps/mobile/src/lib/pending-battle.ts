import type { BattleReportDto } from '@pentilius/shared';

// An attack fired from the planet travels to the zone screen here, so the
// fight shows at once instead of a second wait (the web uses sessionStorage).
let pending: { pentiliId: string; reports: BattleReportDto[] } | null = null;

export function setPendingBattle(pentiliId: string, reports: BattleReportDto[]): void {
  pending = { pentiliId, reports };
}

export function takePendingBattle(pentiliId: string): BattleReportDto[] | null {
  if (!pending || pending.pentiliId !== pentiliId) return null;
  const reports = pending.reports;
  pending = null;
  return reports;
}
