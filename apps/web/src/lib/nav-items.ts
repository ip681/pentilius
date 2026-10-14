// Shared between the desktop Sidebar and the mobile BottomNav so both stay in
// the same order and reuse the same dashboard.<key>.icon assets.
// Ordered by engagement type rather than onboarding order: hub, character,
// social, active PvE/PvP loops, economy/progression, then info-only screens.
// Research is opened from the Research Center in the Base (owner decision, 2026-10-14).
export const NAV_ITEMS: { href: string; labelKey: string; iconKey: string }[] = [
  { href: '/dashboard', labelKey: 'nav.commandCenter', iconKey: 'command_center' },
  { href: '/robot', labelKey: 'nav.robot', iconKey: 'robot' },
  { href: '/clans', labelKey: 'nav.clans', iconKey: 'clans' },
  { href: '/friends', labelKey: 'nav.friends', iconKey: 'friends' },
  { href: '/zones', labelKey: 'nav.zones', iconKey: 'zones' },
  { href: '/pvp', labelKey: 'nav.pvp', iconKey: 'pvp' },
  { href: '/expeditions', labelKey: 'nav.expeditions', iconKey: 'expeditions' },
  { href: '/base', labelKey: 'nav.base', iconKey: 'base' },
  { href: '/players', labelKey: 'nav.leaderboard', iconKey: 'players' },
  { href: '/reports', labelKey: 'nav.reports', iconKey: 'reports' },
  { href: '/shop', labelKey: 'nav.shop', iconKey: 'shop' },
  { href: '/market', labelKey: 'nav.market', iconKey: 'market' },
];
