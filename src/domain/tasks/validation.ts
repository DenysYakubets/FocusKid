import { NewTask } from './types';

export type TaskValidationError =
  | 'TITLE_EMPTY'
  | 'TITLE_TOO_LONG'
  | 'TARGET_RANGE'
  | 'DAYS_EMPTY';

export type ValidateTaskResult =
  | { ok: true; value: NewTask }
  | { ok: false; errors: TaskValidationError[] };

export function validateTask(input: {
  title?: string | null;
  emoji?: string | null;
  targetMinutes?: number;
  daysMask?: number;
  sortOrder?: number;
}): ValidateTaskResult {
  const errors: TaskValidationError[] = [];

  const rawTitle = input.title ?? '';
  const trimmedTitle = rawTitle.trim();

  if (trimmedTitle.length === 0) {
    errors.push('TITLE_EMPTY');
  } else if (trimmedTitle.length > 60) {
    errors.push('TITLE_TOO_LONG');
  }

  const targetMinutes = input.targetMinutes;
  if (
    targetMinutes === undefined ||
    targetMinutes === null ||
    !Number.isInteger(targetMinutes) ||
    targetMinutes < 1 ||
    targetMinutes > 120
  ) {
    errors.push('TARGET_RANGE');
  }

  const daysMask = input.daysMask;
  if (
    daysMask === undefined ||
    daysMask === null ||
    !Number.isInteger(daysMask) ||
    daysMask < 1 ||
    daysMask > 127
  ) {
    errors.push('DAYS_EMPTY');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      title: trimmedTitle,
      emoji: input.emoji ?? null,
      targetMinutes: targetMinutes!,
      daysMask: daysMask!,
      sortOrder: input.sortOrder,
    },
  };
}
