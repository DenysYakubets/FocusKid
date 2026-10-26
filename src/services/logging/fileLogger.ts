import { File, Paths } from 'expo-file-system';
import { systemWallClock } from '../clock/wallClock';

const RETENTION_MS = 6 * 60 * 60 * 1000;
let pending: Promise<void> = Promise.resolve();

// Serialize read/filter/write operations so simultaneous events cannot lose lines.
export function log(level: 'INFO' | 'ERROR', message: string): Promise<void> {
  pending = pending.then(async () => {
    try {
      const timestamp = systemWallClock.nowIso();
      const cutoff = Date.parse(timestamp) - RETENTION_MS;
      const file = new File(Paths.document, 'focuskid.log');
      const content = file.exists ? await file.text() : '';
      const lines = content.split('\n').filter((line) => {
        const iso = line.slice(0, 24);
        return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso)
          && Date.parse(iso) >= cutoff;
      });
      lines.push(`${timestamp} [${level}] ${message.replace(/[\r\n]+/g, ' ')}`);
      await file.write(`${lines.join('\n')}\n`);
    } catch {
      // Diagnostics must never interrupt the app, including on unavailable storage.
    }
  }).catch(() => {});
  return pending;
}

export const logInfo = (message: string): Promise<void> => log('INFO', message);
export const logError = (message: string): Promise<void> => log('ERROR', message);

export async function readLogContent(): Promise<string> {
  try {
    await pending;
    const file = new File(Paths.document, 'focuskid.log');
    return file.exists ? await file.text() : '';
  } catch {
    return '';
  }
}
