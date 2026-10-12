/**
 * Text normalization + matching for the content filter (owner decision,
 * 2026-10-12). Pure functions — the word list itself lives in the BannedWord
 * table (see ContentFilterService).
 *
 * Everything is reduced to a lowercase Latin "skeleton" so the usual evasions
 * collapse onto the same form as the stored word:
 *  - Cyrillic is transliterated (Bulgarian) — "путка" and "putka" match;
 *  - look-alike letters across scripts — a Cyrillic "с" inside a Latin word —
 *    are tried as their Latin twin too;
 *  - digits/symbols used as letters ("f@ck", "sh1t", and the Bulgarian
 *    chat-Latin 4 = ч, 6 = ш) are mapped back;
 *  - separators and repeated letters are removed ("f.u.u.u.c.k" -> "fuck").
 * Since one character can mean different things ("4" is "a" in leetspeak but
 * "ch" in Bulgarian chat-Latin), the text is checked in several readings.
 */

export type MatchMode = 'WHOLE_WORD' | 'SUBSTRING';

export interface FilterWord {
  normalized: string;
  match: MatchMode;
}

const BG_TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya', ѝ: 'i', ё: 'yo', ы: 'y', э: 'e', є: 'e', і: 'i', ї: 'i',
};

// Cyrillic letters that look like Latin ones in lowercase too — read as their
// Latin twin. Uppercase-only look-alikes (В/B, Н/H, Т/T, М/M) are left out on
// purpose: reading lowercase "в" as "b" turned the name "Ева" into "eba".
const HOMOGLYPH: Record<string, string> = {
  а: 'a', е: 'e', к: 'k', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i',
};

const LEET_COMMON: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '€': 'e',
};
// "4" and "6" mean different things in leetspeak vs Bulgarian chat-Latin.
const LEET_READINGS: Record<string, string>[] = [
  { ...LEET_COMMON, '4': 'a', '6': 'g' },
  { ...LEET_COMMON, '4': 'ch', '6': 'sh' },
];

function mapChars(text: string, table: Record<string, string>): string {
  let out = '';
  for (const ch of text) out += table[ch] ?? ch;
  return out;
}

/** Letters only, repeated letters collapsed ("fuuuck" -> "fuck"). */
function squeeze(text: string): string {
  return text.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
}

/** Words (runs of letters) in a reading, each squeezed. */
function tokens(text: string): string[] {
  return text
    .split(/[^a-z]+/)
    .map(squeeze)
    .filter(Boolean);
}

/** The normalized form a stored word is compared in (single reading — words are entered in plain letters). */
export function normalizeWord(word: string): string {
  return squeeze(mapChars(mapChars(word.toLowerCase(), LEET_READINGS[0]), BG_TRANSLIT));
}

/** Every plausible Latin reading of a text (lowercased, digits/symbols mapped, Cyrillic resolved two ways). */
function readings(text: string): string[] {
  const lower = text.toLowerCase();
  const out = new Set<string>();
  for (const leet of LEET_READINGS) {
    const mapped = mapChars(lower, leet);
    out.add(mapChars(mapped, BG_TRANSLIT));
    out.add(mapChars(mapChars(mapped, HOMOGLYPH), BG_TRANSLIT));
  }
  return [...out];
}

/** The banned words found in `text` (empty if it's clean). */
export function findBannedWords(text: string, words: FilterWord[]): string[] {
  if (!text.trim() || words.length === 0) return [];
  const found = new Set<string>();
  for (const reading of readings(text)) {
    const glued = squeeze(reading);
    // Also join single letters spaced out ("f u c k") back into one token.
    const parts = tokens(reading);
    const wordSet = new Set(parts);
    const spacedOut = reading
      .split(/[^a-z]+/)
      .filter(Boolean)
      .every((t) => t.length === 1);
    if (spacedOut) wordSet.add(glued);
    for (const word of words) {
      if (!word.normalized) continue;
      if (word.match === 'SUBSTRING' ? glued.includes(word.normalized) : wordSet.has(word.normalized)) {
        found.add(word.normalized);
      }
    }
  }
  return [...found];
}

/**
 * Clan chat (owner decision, 2026-10-12): instead of rejecting the message,
 * every word containing a banned word is replaced with asterisks of the same
 * length — the conversation goes on, the word isn't shown. Works word by word
 * (whitespace-separated), so "f u c k" spelled out across words isn't masked;
 * reports and blocking cover that.
 */
export function maskBannedWords(text: string, words: FilterWord[]): string {
  if (words.length === 0) return text;
  return text
    .split(/(\s+)/)
    .map((part) => (/\s/.test(part) || findBannedWords(part, words).length === 0 ? part : '*'.repeat([...part].length)))
    .join('');
}
