import {
  EmojiOption,
  EMOJI_OPTIONS,
  filterEmojis,
  searchIndex,
  chunkEmojis,
} from '../emoji';

describe('F5 - curated emoji picker data', () => {
  it('ships a curated kid-friendly list of 30-40 emojis across sport/study/chores/music', () => {
    expect(EMOJI_OPTIONS.length).toBeGreaterThanOrEqual(30);
    expect(EMOJI_OPTIONS.length).toBeLessThanOrEqual(40);

    const chars = EMOJI_OPTIONS.map((o) => o.char);
    expect(new Set(chars).size).toBe(chars.length);

    // Every option is storable in the tasks.emoji column (<= 8 chars) and searchable.
    for (const option of EMOJI_OPTIONS) {
      expect(option.char.length).toBeLessThanOrEqual(8);
      expect(option.keys.trim().length).toBeGreaterThan(0);
    }

    const joined = searchIndex().join(' ');
    for (const topic of ['спорт', 'навчанн', 'прибиран', 'музик']) {
      expect(joined).toContain(topic);
    }
  });

  it('empty/whitespace query returns the whole list', () => {
    expect(filterEmojis('')).toHaveLength(EMOJI_OPTIONS.length);
    expect(filterEmojis('   ')).toHaveLength(EMOJI_OPTIONS.length);
  });

  it('filters by Ukrainian keyword, case-insensitively', () => {
    const sport = filterEmojis('СПОРТ');
    expect(sport.length).toBeGreaterThanOrEqual(4);
    for (const option of sport) {
      expect(`${option.char} ${option.keys}`.toLowerCase()).toContain('спорт');
    }
  });

  it('filters by latin keyword too', () => {
    expect(filterEmojis('football').length).toBeGreaterThanOrEqual(1);
  });

  it('returns nothing for an unknown query', () => {
    expect(filterEmojis('абракадабра')).toEqual([]);
  });

  it('chunks the visible list into grid rows', () => {
    const rows = chunkEmojis(filterEmojis(''), 4);
    expect(rows).toHaveLength(Math.ceil(EMOJI_OPTIONS.length / 4));
    expect(rows[0]).toHaveLength(4);
    const flat: EmojiOption[] = rows.flat();
    expect(flat).toHaveLength(EMOJI_OPTIONS.length);
  });
});