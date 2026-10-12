import { findBannedWords, FilterWord, maskBannedWords, normalizeWord } from './content-filter';

const words: FilterWord[] = [
  { normalized: normalizeWord('fuck'), match: 'SUBSTRING' },
  { normalized: normalizeWord('путка'), match: 'SUBSTRING' },
  { normalized: normalizeWord('ass'), match: 'WHOLE_WORD' },
  { normalized: normalizeWord('шибан'), match: 'SUBSTRING' },
  { normalized: normalizeWord('еба'), match: 'WHOLE_WORD' },
];

const blocked = (text: string) => findBannedWords(text, words).length > 0;

describe('content filter', () => {
  it('catches plain words in both languages', () => {
    expect(blocked('fuck')).toBe(true);
    expect(blocked('ПУТКА')).toBe(true);
  });

  it('catches Bulgarian written in Latin (chat-Latin)', () => {
    expect(blocked('putka')).toBe(true);
    expect(blocked('6iban')).toBe(true);
  });

  it('catches leetspeak, separators and repeated letters', () => {
    expect(blocked('f@ck')).toBe(false); // "@" -> "a": "fack" is a different word — not over-reaching
    expect(blocked('fu(k')).toBe(false);
    expect(blocked('f.u.c.k')).toBe(true);
    expect(blocked('fuuuuck')).toBe(true);
    expect(blocked('f u c k')).toBe(true);
    expect(blocked('xXfuckXx')).toBe(true);
  });

  it('catches Cyrillic look-alike letters inside a Latin word', () => {
    expect(blocked('fuсk')).toBe(true); // Cyrillic "с"
  });

  it('matches whole-word entries only as standalone words', () => {
    expect(blocked('ass')).toBe(true);
    expect(blocked('my ass')).toBe(true);
    expect(blocked('classic')).toBe(false);
    expect(blocked('Bassist')).toBe(false);
  });

  it('lets ordinary names through', () => {
    for (const name of ['Master', 'Aragorn', 'Sim Titans', 'Пентилиус', 'Vidin_Ultra', 'Скъпа_Кутия', 'Ева', 'потреба', 'небе', 'газ', 'куратор']) {
      expect(blocked(name)).toBe(false);
    }
  });

  it('masks only the offending words in chat', () => {
    expect(maskBannedWords('ти си putka брат', words)).toBe('ти си ***** брат');
    expect(maskBannedWords('what the fuuuck!', words)).toBe('what the *******');
    expect(maskBannedWords('classic bass solo', words)).toBe('classic bass solo');
  });
});
