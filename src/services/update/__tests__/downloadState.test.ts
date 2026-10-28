import { initialDownloadState, nextDownloadState } from '../downloadState';

describe('download state machine', () => {
  it('covers legal transitions and rejects illegal events by identity', () => {
    const idle = initialDownloadState();
    expect(nextDownloadState(idle, { type: 'progress', percent: 4 })).toBe(idle);
    expect(nextDownloadState(idle, { type: 'verifying' })).toBe(idle);
    let state = nextDownloadState(idle, { type: 'start' });
    expect(state).toEqual({ phase: 'downloading', percent: 0, errorMessage: null });
    state = nextDownloadState(state, { type: 'verifying' });
    expect(state.phase).toBe('verifying');
    expect(nextDownloadState(state, { type: 'ready' }).phase).toBe('ready');
    expect(nextDownloadState(state, { type: 'error', message: 'bad' })).toBe(state);
  });

  it('clamps progress and ignores non-finite values or progress outside download phase', () => {
    let state = nextDownloadState(initialDownloadState(), { type: 'start' });
    state = nextDownloadState(state, { type: 'progress', percent: -8 });
    expect(state.percent).toBe(0);
    state = nextDownloadState(state, { type: 'progress', percent: 55 });
    expect(state.percent).toBe(55);
    expect(nextDownloadState(state, { type: 'progress', percent: 55.9 })).toBe(state);
    expect(nextDownloadState(state, { type: 'progress', percent: Number.NaN })).toBe(state);
    expect(nextDownloadState(state, { type: 'progress', percent: 200 }).percent).toBe(100);
    const verifying = nextDownloadState(state, { type: 'verifying' });
    expect(nextDownloadState(verifying, { type: 'progress', percent: 1 })).toBe(verifying);
  });

  it('carries download errors and retries to idle', () => {
    const downloading = nextDownloadState(initialDownloadState(), { type: 'start' });
    const error = nextDownloadState(downloading, { type: 'error', message: 'network' });
    expect(error).toEqual({ phase: 'error', percent: 0, errorMessage: 'network' });
    expect(nextDownloadState(error, { type: 'retry' })).toEqual(initialDownloadState());
    const idle = initialDownloadState();
    expect(nextDownloadState(idle, { type: 'retry' })).toBe(idle);
  });
});
