// The game's colours, the same as the web (apps/web/tailwind.config.ts).
export const colors = {
  ink: '#080c11',
  inkRaised: '#0e141b',
  panel: '#10171e',
  panelBorder: '#29353f',
  panelBorderDanger: '#403132',
  well: '#0c1217',
  wellBorder: '#222d35',
  text: '#dce5eb',
  textMuted: '#75848e',
  textFaint: '#647482',
  accent: '#405360',
  accentBg: '#1c2a33',
  accentBgHover: '#273b47',
  positive: '#7fc7a0',
  danger: '#a56e6e',
  gold: '#c5a873',
  vipGold: '#c5a873',
  // The web's "energy" token — it colours the XP bar there.
  cyan: '#5ec8d8',
  // Energy is always yellow/gold, never blue (owner): the web's energy bar is bg-gold.
  energy: '#c5a873',
  panelHeader: '#0d1319',
  epic: '#b5712c',
  // Gold / silver / bronze for the top three places.
  podiumGold: '#e8b923',
  silver: '#c0c7cf',
  bronze: '#c27c45',
};

// A race-locked item's square gets a tint of its race's colour (the web's RACE_BG_CLASS, 20%).
export const RACE_TINT: Record<string, string> = {
  LUXARI: 'rgba(61,139,255,0.2)',
  VORLUN: 'rgba(76,175,80,0.2)',
  ZARYTH: 'rgba(155,93,229,0.2)',
  THALION: 'rgba(212,175,55,0.2)',
  NEXAR: 'rgba(192,57,43,0.2)',
};

export const spacing = (n: number) => n * 4;
