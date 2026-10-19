// The game's dark colours, the same as the web (apps/web/tailwind.config.ts).
export const colors = {
  ink: '#080c11',
  panel: '#10171e',
  panelBorder: '#29353f',
  well: '#0c1217',
  wellBorder: '#222d35',
  text: '#dce5eb',
  textMuted: '#75848e',
  textFaint: '#647482',
  accent: '#405360',
  accentBg: '#1c2a33',
  positive: '#7fc7a0',
  danger: '#a56e6e',
  gold: '#c5a873',
  // Energy is always yellow, never blue (owner).
  energy: '#e3c25b',
};

export const spacing = (n: number) => n * 4;
