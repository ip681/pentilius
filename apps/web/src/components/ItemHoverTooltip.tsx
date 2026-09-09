'use client';

import type { ItemOption, ItemStatsDto, Race } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { AssetIcon } from './AssetIcon';

const TOOLTIP_WIDTH = 224;

// A tap on mobile fires a synthetic mouseenter (there's no real "move the
// pointer away" gesture to trigger mouseleave), so without this the tooltip
// would stay stuck open until another item is tapped. Dismissing on the next
// scroll or tap-elsewhere covers both common ways a player "moves on" — and
// scroll dismissal also sidesteps the tooltip's fixed position going stale
// relative to its anchor once the page scrolls.
export function useItemHoverTooltip() {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!rect) return;
    const dismiss = () => setRect(null);
    // capture: true so this catches scrolling inside a nested overflow-y-auto
    // grid too, not just the window itself.
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('touchstart', dismiss, true);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('touchstart', dismiss, true);
    };
  }, [rect]);

  return {
    rect,
    show: (e: { currentTarget: HTMLElement }) => setRect(e.currentTarget.getBoundingClientRect()),
    hide: () => setRect(null),
  };
}

// `position: fixed` (viewport-relative) rather than an absolutely-positioned
// child, so the tooltip can't be clipped by a scrolling ancestor (an
// inventory/market grid's own overflow-y-auto) — it escapes that ancestor
// entirely. Flips above the item when there isn't enough room below the
// viewport edge.
function tooltipPositionStyle(rect: DOMRect): CSSProperties {
  const gap = 8;
  const left = Math.min(Math.max(gap, rect.left), window.innerWidth - TOOLTIP_WIDTH - gap);
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < 140) {
    return { left, bottom: window.innerHeight - rect.top + gap };
  }
  return { left, top: rect.bottom + gap };
}

// Desktop-only hover preview (mouse enter/leave never meaningfully fires on
// touch) — the native `title` tooltip it replaces only ever showed the name
// and can't be styled or hold real content. `children` lets callers show
// either a plain description or the equipment item's full stat breakdown.
export function ItemHoverTooltip({ rect, name, children }: { rect: DOMRect; name: string; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-md border border-panelBorder bg-panel p-2.5 text-[11px] shadow-lg"
      style={{ width: TOOLTIP_WIDTH, ...tooltipPositionStyle(rect) }}
    >
      <p className="mb-1 font-semibold text-text">{name}</p>
      {children}
    </div>
  );
}

// Structural, not InventoryItemDto specifically — MarketListingDto carries the
// same shape (currentStats/maxUpgradeLevel/race/rolledOptions) so both the
// inventory grid and the Market's listings/picker can share this.
export interface EquipmentTooltipItem {
  upgradeLevel: number;
  maxUpgradeLevel: number;
  currentStats: ItemStatsDto | null;
  race: Race | null;
  rolledOptions: ItemOption[];
}

// Full stat/race/options breakdown for an equipment item's hover tooltip —
// same information as the click-through details panel, minus its action rows
// (upgrade/sell/recycle/buy), which don't belong in a hover preview.
export function EquipmentTooltipDetails({ item, playerRace }: { item: EquipmentTooltipItem; playerRace: Race | undefined }) {
  const t = useTranslations();
  const hasStats = item.currentStats?.attack !== undefined || item.currentStats?.defense !== undefined || item.currentStats?.hp !== undefined;

  return (
    <>
      <p className="mb-1.5 text-textMuted">
        {t('robot.upgradeLevel')}: {item.upgradeLevel}/{item.maxUpgradeLevel}
      </p>
      {hasStats && (
        <div className="mb-1.5 rounded border border-wellBorder bg-ink p-2">
          {(['attack', 'defense', 'hp'] as const).map((key) => {
            const value = item.currentStats?.[key];
            if (value === undefined) return null;
            return (
              <div key={key} className="flex justify-between text-textFaint">
                <span>{t(`robot.stat.${key === 'attack' ? 'damage' : key}`)}</span>
                <span className="text-text">{value}</span>
              </div>
            );
          })}
        </div>
      )}
      {item.race && (
        <p className={`mb-1.5 flex items-center gap-1.5 ${item.race === playerRace ? 'text-positive' : 'text-danger'}`}>
          <AssetIcon
            assetId={`races.${item.race.toLowerCase()}.icon`}
            alt={t(`race.${item.race}.name`)}
            className="h-3.5 w-3.5 shrink-0 object-contain"
            fallback={<span className="text-[8px] font-semibold">{t(`race.${item.race}.name`).charAt(0)}</span>}
          />
          {t('robot.raceLocked', { race: t(`race.${item.race}.name`) })}
        </p>
      )}
      {item.rolledOptions.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {item.rolledOptions.map((option) => (
            <li key={option} className="text-positive">
              {t(`itemOption.${option}`)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
