// The same menu as the web (apps/web/src/lib/nav-items.ts): order and the
// dashboard.<icon>.icon images. `route` is the app's tab for that page.
export const NAV_ITEMS: { route: string; labelKey: string; iconKey: string }[] = [
  { route: 'home', labelKey: 'nav.commandCenter', iconKey: 'command_center' },
  { route: 'robot', labelKey: 'nav.robot', iconKey: 'robot' },
  { route: 'clans', labelKey: 'nav.clans', iconKey: 'clans' },
  { route: 'friends', labelKey: 'nav.friends', iconKey: 'friends' },
  { route: 'zones', labelKey: 'nav.zones', iconKey: 'zones' },
  { route: 'pvp', labelKey: 'nav.pvp', iconKey: 'pvp' },
  { route: 'expeditions', labelKey: 'nav.expeditions', iconKey: 'expeditions' },
  { route: 'base', labelKey: 'nav.base', iconKey: 'base' },
  { route: 'players', labelKey: 'nav.leaderboard', iconKey: 'players' },
  { route: 'reports', labelKey: 'nav.reports', iconKey: 'reports' },
  { route: 'shop', labelKey: 'nav.shop', iconKey: 'shop' },
  { route: 'market', labelKey: 'nav.market', iconKey: 'market' },
];

/** The website page for a tab not yet in the app. */
export const WEB_PATHS: Record<string, string> = {
  clans: '/clans',
  friends: '/friends',
  zones: '/zones',
  robot: '/robot',
  pvp: '/pvp',
  expeditions: '/expeditions',
  players: '/players',
  reports: '/reports',
  shop: '/shop',
  market: '/market',
  research: '/research',
  settings: '/settings',
  about: '/about',
};
