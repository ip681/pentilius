import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Dark sci-fi palette shared across every game screen.
        ink: '#080c11',
        inkRaised: '#0e141b',
        panel: '#10171e',
        panelHeader: '#0d1319',
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
        // EPIC item quality (2 Excellent options) — distinct from RARE's green
        // (positive above), so the two are never confused at a glance.
        epic: '#b5712c',
        // Action Energy bar fill — a distinct cyan so it's never confused with
        // HP (positive/danger) or the XP bar (gold) at a glance.
        energy: '#5ec8d8',
        // Per-race brand colors (instructions/PRODUCT_SPEC.md's 5 races), matched
        // to each race's icon art — used at low opacity as an inventory slot's
        // background tint for a race-locked item, never at full strength.
        raceLuxari: '#3d8bff',
        raceVorlun: '#4caf50',
        raceZaryth: '#9b5de5',
        raceThalion: '#d4af37',
        raceNexar: '#c0392b',
      },
    },
  },
  plugins: [],
};

export default config;
