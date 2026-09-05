import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Dark sci-fi palette shared across every game screen — see design-references/.
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
      },
    },
  },
  plugins: [],
};

export default config;
