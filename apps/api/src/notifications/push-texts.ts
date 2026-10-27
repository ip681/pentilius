import { NotificationType } from '@pentilius/shared';

type Locale = 'bg' | 'en';
type Text = { title: string; body: string };

// Push texts are rendered on the server (the game may be closed), so they
// live here rather than in the web app's message files. Kept deliberately
// generic — the server has translation keys, not translated building names.
const TEXTS: Record<Locale, Record<NotificationType, Text>> = {
  bg: {
    ENERGY_FULL: { title: 'Енергията е пълна', body: 'Време е за битка — енергията ти е на максимум.' },
    CONSTRUCTION_DONE: { title: 'Строежът завърши', body: 'Сграда в базата ти е готова.' },
    RESEARCH_DONE: { title: 'Проучването завърши', body: 'Ново ниво на технология е готово.' },
    EXPEDITION_DONE: { title: 'Експедицията се върна', body: 'Вземи наградите си.' },
    PVP_ATTACKED: { title: 'Нападнаха те!', body: '{attacker} нападна базата ти.' },
    BOSS_BATTLE_DONE: { title: 'Битката с боса приключи', body: '' },
  },
  en: {
    ENERGY_FULL: { title: 'Energy is full', body: 'Time to fight — your energy is at its maximum.' },
    CONSTRUCTION_DONE: { title: 'Construction finished', body: 'A building in your base is ready.' },
    RESEARCH_DONE: { title: 'Research finished', body: 'A new technology level is ready.' },
    EXPEDITION_DONE: { title: 'Expedition is back', body: 'Collect your rewards.' },
    PVP_ATTACKED: { title: 'You were attacked!', body: '{attacker} attacked your base.' },
    BOSS_BATTLE_DONE: { title: 'Boss battle finished', body: '' },
  },
};

const PVP_RESULT: Record<Locale, { won: string; lost: string }> = {
  bg: { won: ' Отби атаката.', lost: ' Загуби битката.' },
  en: { won: ' You held them off.', lost: ' You lost the battle.' },
};

// The server has the boss's translation key, not its name — so the result only.
const BOSS_RESULT: Record<Locale, { won: string; lost: string }> = {
  bg: { won: 'Победа! Формацията ти повали боса.', lost: 'Загуба — босът оцеля. Виж битката.' },
  en: { won: 'Victory! Your formation brought the boss down.', lost: 'Defeat — the boss survived. Watch the battle.' },
};

export function pushText(locale: Locale, type: NotificationType, params: Record<string, string>): Text {
  const text = TEXTS[locale][type];
  let body = text.body.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? '');
  if (type === 'PVP_ATTACKED' && params.defenderWon) body += params.defenderWon === 'true' ? PVP_RESULT[locale].won : PVP_RESULT[locale].lost;
  if (type === 'BOSS_BATTLE_DONE') body = params.won === 'true' ? BOSS_RESULT[locale].won : BOSS_RESULT[locale].lost;
  return { title: text.title, body };
}
