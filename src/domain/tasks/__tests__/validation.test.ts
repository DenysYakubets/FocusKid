import { validateTask } from '../validation';

describe('validateTask', () => {
  it('validates a correct task input', () => {
    const res = validateTask({
      title: '  Читання  ',
      emoji: '📚',
      targetMinutes: 15,
      daysMask: 127,
      sortOrder: 0,
    });
    expect(res).toEqual({
      ok: true,
      value: {
        title: 'Читання',
        emoji: '📚',
        targetMinutes: 15,
        daysMask: 127,
        sortOrder: 0,
      },
    });
  });

  it('rejects empty or whitespace-only title with TITLE_EMPTY', () => {
    const resEmpty = validateTask({ title: '', targetMinutes: 15, daysMask: 127 });
    expect(resEmpty).toEqual({ ok: false, errors: ['TITLE_EMPTY'] });

    const resWhitespace = validateTask({ title: '   ', targetMinutes: 15, daysMask: 127 });
    expect(resWhitespace).toEqual({ ok: false, errors: ['TITLE_EMPTY'] });

    const resNull = validateTask({ title: null, targetMinutes: 15, daysMask: 127 });
    expect(resNull).toEqual({ ok: false, errors: ['TITLE_EMPTY'] });
  });

  it('rejects title longer than 60 chars with TITLE_TOO_LONG', () => {
    const longTitle = 'A'.repeat(61);
    const res = validateTask({ title: longTitle, targetMinutes: 15, daysMask: 127 });
    expect(res).toEqual({ ok: false, errors: ['TITLE_TOO_LONG'] });
  });

  it('rejects targetMinutes outside 1-120 or non-integer with TARGET_RANGE', () => {
    expect(validateTask({ title: 'Task', targetMinutes: 0, daysMask: 127 })).toEqual({
      ok: false,
      errors: ['TARGET_RANGE'],
    });
    expect(validateTask({ title: 'Task', targetMinutes: 121, daysMask: 127 })).toEqual({
      ok: false,
      errors: ['TARGET_RANGE'],
    });
    expect(validateTask({ title: 'Task', targetMinutes: 15.5, daysMask: 127 })).toEqual({
      ok: false,
      errors: ['TARGET_RANGE'],
    });
  });

  it('rejects daysMask outside 1-127 or non-integer with DAYS_EMPTY', () => {
    expect(validateTask({ title: 'Task', targetMinutes: 15, daysMask: 0 })).toEqual({
      ok: false,
      errors: ['DAYS_EMPTY'],
    });
    expect(validateTask({ title: 'Task', targetMinutes: 15, daysMask: 128 })).toEqual({
      ok: false,
      errors: ['DAYS_EMPTY'],
    });
  });

  it('collects multiple validation errors together', () => {
    const res = validateTask({
      title: '',
      targetMinutes: 200,
      daysMask: 0,
    });
    expect(res).toEqual({
      ok: false,
      errors: ['TITLE_EMPTY', 'TARGET_RANGE', 'DAYS_EMPTY'],
    });
  });
});
