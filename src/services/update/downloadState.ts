export type DownloadPhase = 'idle' | 'downloading' | 'verifying' | 'ready' | 'error';

export interface DownloadState {
  phase: DownloadPhase;
  percent: number;
  errorMessage: string | null;
}

export type DownloadEvent =
  | { type: 'start' }
  | { type: 'progress'; percent: number }
  | { type: 'verifying' }
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'retry' };

export function initialDownloadState(): DownloadState {
  return { phase: 'idle', percent: 0, errorMessage: null };
}

export function nextDownloadState(state: DownloadState, event: DownloadEvent): DownloadState {
  switch (event.type) {
    case 'start':
      return state.phase === 'idle' || state.phase === 'error'
        ? { phase: 'downloading', percent: 0, errorMessage: null } : state;
    case 'progress':
      if (state.phase !== 'downloading' || !Number.isInteger(event.percent)) return state;
      return { ...state, percent: Math.min(100, Math.max(0, event.percent)) };
    case 'verifying':
      return state.phase === 'downloading' ? { ...state, phase: 'verifying', percent: 100 } : state;
    case 'ready':
      return state.phase === 'verifying' ? { ...state, phase: 'ready' } : state;
    case 'error':
      return state.phase === 'downloading' ? { ...state, phase: 'error', errorMessage: event.message } : state;
    case 'retry':
      return state.phase === 'error' ? initialDownloadState() : state;
  }
}
