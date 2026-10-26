import { logInfo, logError, readLogContent } from '../fileLogger';

jest.mock('expo-file-system', () => {
  const state = { exists: false, text: '' };
  class File {
    constructor(_dir: string, _name: string) {}
    get exists() {
      return state.exists;
    }
    async text(): Promise<string> {
      return state.text;
    }
    async write(value: string): Promise<void> {
      state.text = value;
      state.exists = true;
    }
  }
  return { File, Paths: { document: '/documents' }, __state: state };
});

const store = jest.requireMock('expo-file-system').__state as {
  exists: boolean;
  text: string;
};

const HOUR_MS = 60 * 60 * 1000;
const isoAgo = (hours: number) => new Date(Date.now() - hours * HOUR_MS).toISOString();

beforeEach(() => {
  store.exists = false;
  store.text = '';
});

describe('fileLogger', () => {
  it('appends ISO [LEVEL] message lines to Documents/focuskid.log', async () => {
    await logInfo('task created');
    await logError('refresh failed');

    const lines = store.text.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] task created$/
    );
    expect(lines[1]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[ERROR\] refresh failed$/
    );
    expect(await readLogContent()).toBe(store.text);
  });

  it('drops only lines older than the 6h retention window on write', async () => {
    store.exists = true;
    store.text = [
      `${isoAgo(7)} [INFO] seven hours old`,
      `${isoAgo(5.9)} [INFO] inside the window`,
      `${isoAgo(0.1)} [ERROR] just now`,
      'not a log line',
    ].join('\n') + '\n';

    await logInfo('fresh entry');

    const content = await readLogContent();
    expect(content).not.toContain('seven hours old');
    expect(content).toContain('inside the window');
    expect(content).toContain('just now');
    expect(content).toContain('fresh entry');
    // A line without a parseable timestamp cannot be aged, so it is dropped
    // instead of living in the file forever.
    expect(content).not.toContain('not a log line');
  });

  it('never throws into the app and reports an empty log when the file is missing', async () => {
    await expect(logInfo('first line')).resolves.toBeUndefined();
    store.exists = false;
    store.text = '';
    await expect(readLogContent()).resolves.toBe('');
  });

  it('keeps a single file handle per write and serialises concurrent appends', async () => {
    await Promise.all([logInfo('one'), logInfo('two'), logError('three')]);
    const lines = store.text.split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(new Set(lines).size).toBe(3);
  });
});