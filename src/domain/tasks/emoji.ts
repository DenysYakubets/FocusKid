export interface EmojiOption {
  /** The emoji itself — stored verbatim in `tasks.emoji` (schema: <= 8 chars). */
  char: string;
  /** Ukrainian (+ a couple of latin) search keywords, lower-case. */
  keys: string;
}

/**
 * F5: curated, kid-friendly emoji list for the task picker. Free keyboard entry
 * was unreliable on device, so the form picks from this fixed grid instead —
 * no system keyboard is needed to choose an emoji.
 */
export const EMOJI_OPTIONS: readonly EmojiOption[] = [
  // Sport
  { char: '⚽', keys: 'спорт мʼяч футбол football' },
  { char: '🏀', keys: 'спорт баскетбол мʼяч' },
  { char: '🏃', keys: 'спорт біг бігати' },
  { char: '🚴', keys: 'спорт велосипед їзда' },
  { char: '🏊', keys: 'спорт плавання басейн' },
  { char: '⛹️', keys: 'спорт гра тренування' },
  // Study
  { char: '📚', keys: 'навчання книга читання' },
  { char: '📖', keys: 'навчання книга читання' },
  { char: '✏️', keys: 'навчання письмо олівець' },
  { char: '📝', keys: 'навчання домашнє завдання' },
  { char: '🔢', keys: 'навчання математика числа' },
  { char: '🎨', keys: 'навчання малювання творчість' },
  { char: '🔬', keys: 'навчання наука досліди' },
  { char: '🌍', keys: 'навчання географія світ' },
  // Chores
  { char: '🧹', keys: 'прибирання кімната дім' },
  { char: '🧺', keys: 'прибирання прання білизна' },
  { char: '🍽️', keys: 'прибирання посуд миття' },
  { char: '🛏️', keys: 'прибирання ліжко кімната' },
  { char: '🪥', keys: 'гігієна зуби ранок' },
  { char: '🐕', keys: 'дім тварина собака вигул' },
  // Music
  { char: '🎸', keys: 'музика гітара' },
  { char: '🥁', keys: 'музика барабан' },
  { char: '🎤', keys: 'музика співи пісня' },
  { char: '🎹', keys: 'музика піаніно клавіші' },
  { char: '🎵', keys: 'музика пісня мелодія' },
  // Nature & food
  { char: '🌱', keys: 'природа рослина сад' },
  { char: '🌳', keys: 'природа дерево ліс' },
  { char: '🍎', keys: 'їжа фрукт перекус' },
  { char: '🥕', keys: 'їжа овоч перекус' },
  // Rest & play
  { char: '🧩', keys: 'гра головоломка' },
  { char: '🎮', keys: 'гра ігри відпочинок' },
  { char: '🌙', keys: 'сон вечір відпочинок' },
  { char: '🛌', keys: 'сон відпочинок ліжко' },
  { char: '🐱', keys: 'дім тварина кіт' },
  // Rewards
  { char: '⭐', keys: 'нагорода зірка мотивація' },
  { char: '🏆', keys: 'нагорода кубок перемога' },
] as const;

/** Lower-cased haystack used by tests and the picker search. */
export function searchIndex(): string[] {
  return EMOJI_OPTIONS.map((option) => `${option.char} ${option.keys}`.toLowerCase());
}

/** Case-insensitive substring filter; empty query returns the whole list. */
export function filterEmojis(query: string): EmojiOption[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return [...EMOJI_OPTIONS];
  }
  return EMOJI_OPTIONS.filter((option) =>
    `${option.char} ${option.keys}`.toLowerCase().includes(normalized)
  );
}

/** Rows of `size` for the picker grid layout. */
export function chunkEmojis(options: readonly EmojiOption[], size: number): EmojiOption[][] {
  const rows: EmojiOption[][] = [];
  for (let i = 0; i < options.length; i += size) {
    rows.push(options.slice(i, i + size));
  }
  return rows;
}