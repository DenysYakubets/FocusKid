import { uk } from '../i18n/uk';

export function mapTimerError(code: string | null): string {
  switch (code) {
    case 'PARENT_AUTH_REQUIRED':
      return uk.timer.errors.parentAuthRequired;
    case 'NOT_COMPLETED':
      return uk.timer.errors.notCompleted;
    case 'VERIFIED_IMMUTABLE':
      return uk.timer.errors.verifiedImmutable;
    case 'INVALID_SESSION':
      return uk.timer.errors.invalidSession;
    case 'ACTIVE_SESSION_EXISTS':
      return uk.today.activeSessionError;
    case 'SESSION_LIMIT_REACHED_TODAY':
      return uk.today.sessionLimitError;
    case 'SESSION_ALREADY_EXISTS_TODAY':
    case 'TASK_NOT_FOUND':
    default:
      return uk.today.startError;
  }
}
