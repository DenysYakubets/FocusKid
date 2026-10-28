import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import { DownloadTask, File, Paths } from 'expo-file-system';
import { formatError } from '../logging/formatError';
import { logError, logInfo } from '../logging/fileLogger';
import { UpdateManifest } from './checkForUpdate';

const APK_MIME = 'application/vnd.android.package-archive';
const APK_NAME = 'focuskid-update.apk';
export const PENDING_UPDATE_KEY = '@focuskid/pending_update';
/** The installer may never deliver onActivityResult, so this stage must not block the fallback ladder forever. */
export const INSTALL_INTENT_TIMEOUT_MS = 8000;

export function expectedApkCacheUri(): string {
  return `${Paths.cache.uri.replace(/\/$/, '')}/${APK_NAME}`;
}

export function openCachedApk(uri: string): File {
  return new File(uri);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

export class ApkDigestMismatchError extends Error {
  constructor() {
    super('Downloaded APK checksum does not match the update manifest');
    this.name = 'ApkDigestMismatchError';
  }
}

export async function downloadApk(
  manifest: UpdateManifest,
  onProgress: (percent: number) => void,
): Promise<File> {
  void logInfo('update download start');
  const cache = Paths.cache;
  if (!cache.exists) cache.create({ intermediates: true });
  const destination = new File(cache, APK_NAME);
  if (destination.exists) destination.delete();
  const milestones = [0, 25, 50, 75, 100];
  let lastMilestone = -1;
  const task = new DownloadTask(manifest.url, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0) {
        const percent = Math.min(100, Math.floor((bytesWritten / totalBytes) * 100));
        onProgress(percent);
        const crossed = milestones.filter((milestone) => milestone > lastMilestone && percent >= milestone);
        crossed.forEach((milestone) => void logInfo(`update download ${milestone}%`));
        const top = crossed[crossed.length - 1];
        if (top !== undefined) lastMilestone = top;
      }
    },
  });
  const file = await task.downloadAsync();
  if (!file) throw new Error('APK download did not complete');
  void logInfo(`update download complete bytes=${file.size}`);
  const digest = await file.digest('SHA-256');
  if (digest.toLowerCase() !== manifest.sha256.toLowerCase()) {
    void logError('update download digest mismatch');
    file.delete();
    throw new ApkDigestMismatchError();
  }
  return file;
}

function providerUri(file: File): string {
  const cacheUri = Paths.cache.uri.replace(/\/$/, '');
  if (!file.uri.startsWith(`${cacheUri}/`)) throw new Error('APK is outside the app cache');
  const relativePath = file.uri.slice(cacheUri.length + 1);
  return `content://com.focuskid.app.fileprovider/cache/${relativePath}`;
}

export async function installApk(file: File, manifestUrl: string): Promise<void> {
  const uri = file.uri;
  const existing = installFlights.get(uri);
  if (existing) return existing;
  const flight = performInstall(file, manifestUrl);
  installFlights.set(uri, flight);
  try {
    return await flight;
  } finally {
    if (installFlights.get(uri) === flight) installFlights.delete(uri);
  }
}

const installFlights = new Map<string, Promise<void>>();

async function performInstall(file: File, manifestUrl: string): Promise<void> {
  try {
    void logInfo('update install route attempt stage=1');
    await withTimeout(IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: providerUri(file),
      type: APK_MIME,
      // Android 12+ requires explicit URI read access. FLAG_GRANT_READ_URI_PERMISSION is sufficient;
      // startActivityForResult uses the current Activity, so FLAG_ACTIVITY_NEW_TASK is not needed.
      flags: 1,
    }), INSTALL_INTENT_TIMEOUT_MS, 'Android installer did not return an activity result');
    void logInfo('update install route success stage=1');
    return;
  } catch (intentError) {
    void logError(`update install stage=1 FileProvider ${intentError instanceof Error ? `${intentError.name}: ${intentError.message}` : String(intentError)}`);
    void logError(`update install fallback: FileProvider intent failed: ${formatError(intentError)}`);
  }

  try {
    void logInfo('update install route attempt stage=2');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: APK_MIME, dialogTitle: 'FocusKid update' });
      void logInfo('update install route success stage=2');
      return;
    }
    void logError('update install fallback: expo-sharing unavailable');
  } catch (shareError) {
    void logError(`update install fallback: expo-sharing failed: ${formatError(shareError)}`);
  }

  try {
    void logInfo('update install route attempt stage=3');
    await Linking.openURL(manifestUrl);
    void logInfo('update install route success stage=3');
  } catch (browserError) {
    void logError(`update install fallback: browser failed: ${formatError(browserError)}`);
    void logError('update install all routes failed');
    throw browserError;
  }
}
