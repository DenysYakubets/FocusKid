import { DownloadTask, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import { formatError } from '../logging/formatError';
import { logError } from '../logging/fileLogger';
import { UpdateManifest } from './checkForUpdate';

const APK_MIME = 'application/vnd.android.package-archive';
const APK_NAME = 'focuskid-update.apk';

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
  const cache = Paths.cache;
  if (!cache.exists) cache.create({ intermediates: true });
  const destination = new File(cache, APK_NAME);
  if (destination.exists) destination.delete();
  const task = new DownloadTask(manifest.url, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0) onProgress(Math.floor((bytesWritten / totalBytes) * 100));
    },
  });
  const file = await task.downloadAsync();
  if (!file) throw new Error('APK download did not complete');
  const digest = await file.digest('SHA-256');
  if (digest.toLowerCase() !== manifest.sha256.toLowerCase()) {
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
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: providerUri(file),
      type: APK_MIME,
      flags: 1, // Intent.FLAG_GRANT_READ_URI_PERMISSION
    });
    return;
  } catch (intentError) {
    void logError(`update install fallback: FileProvider intent failed: ${formatError(intentError)}`);
  }

  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: APK_MIME, dialogTitle: 'FocusKid update' });
      return;
    }
    void logError('update install fallback: expo-sharing unavailable');
  } catch (shareError) {
    void logError(`update install fallback: expo-sharing failed: ${formatError(shareError)}`);
  }

  try {
    await Linking.openURL(manifestUrl);
  } catch (browserError) {
    void logError(`update install fallback: browser failed: ${formatError(browserError)}`);
    throw browserError;
  }
}
