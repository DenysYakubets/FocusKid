import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { parentSessionStore } from '../../state/parentSessionStore';
import { useServices } from '../../state/appServices';
import { MANIFEST_URL, isNewerVersion, parseUpdateManifest, UpdateManifest } from '../../services/update/checkForUpdate';
import { downloadApk, expectedApkCacheUri, installApk, openCachedApk, PENDING_UPDATE_KEY } from '../../services/update/downloadApk';
import { DownloadState, initialDownloadState, nextDownloadState } from '../../services/update/downloadState';
import { uk } from '../../i18n/uk';
import { logError, logInfo } from '../../services/logging/fileLogger';
import { AppText } from './AppText';
import { TapTarget } from './TapTarget';
import { colors, spacing, typographyWeights } from '../theme';

const FETCH_TIMEOUT_MS = 5000;

export interface UpdateCheckerProps {
  /** Bumped by useUpdateRecheck() on screen focus; refetches the manifest. */
  recheckKey?: number;
}

export function UpdateChecker({ recheckKey = 0 }: UpdateCheckerProps = {}) {
  const { settingsRepo } = useServices();
  const [update, setUpdate] = useState<UpdateManifest | null>(null);
  const [download, setDownload] = useState<DownloadState>(initialDownloadState);

  useEffect(() => {
    let mounted = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      void logInfo('update check start');
      try {
        // Native build code is used when available; Constants covers Expo Go and other non-native environments.
        const nativeBuildVersion = Application.nativeBuildVersion ?? Constants.nativeBuildVersion;
        const currentCode = Number.parseInt(nativeBuildVersion ?? '', 10);
        if (!Number.isInteger(currentCode) || currentCode <= 0) return;
        const timeoutGuard = new Promise<null>((resolve) => {
          timeout = setTimeout(() => resolve(null), FETCH_TIMEOUT_MS);
        });
        const response = await Promise.race([
          globalThis.fetch(MANIFEST_URL).then((result) => result.ok ? result.text() : null),
          timeoutGuard,
        ]);
        if (!response || !mounted) {
          if (!response) void logError('update check fetch error');
          return;
        }
        const manifest = parseUpdateManifest(response);
        if (manifest && isNewerVersion(manifest.versionCode, currentCode)) {
          void logInfo(`update check newer versionCode=${manifest.versionCode}`);
          setUpdate(manifest);
          const rawPending = await settingsRepo.get(PENDING_UPDATE_KEY);
          if (!mounted || !rawPending) return;
          try {
            const pending = JSON.parse(rawPending) as { versionCode: number; url: string; filePath: string; phase: string };
            if (pending.phase === 'ready' && pending.versionCode === manifest.versionCode && pending.url === manifest.url) {
              const file = openCachedApk(pending.filePath);
              if (file.exists) setDownload({ phase: 'ready', percent: 100, errorMessage: null });
            } else {
            }
          } catch (e) {
          }
        } else {
          void logInfo('update check no update');
        }
      } catch (error) {
        void logError('update check fetch error');
        // Update checks are best-effort and must never interrupt app use.
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    }
    void check();
    return () => {
      mounted = false;
      if (timeout !== undefined) clearTimeout(timeout);
    };
  }, [settingsRepo, recheckKey]);

  const runInstall = async (manifest: UpdateManifest, file: Parameters<typeof installApk>[0]) => {
    try {
      await installApk(file, manifest.url);
      await settingsRepo.set(PENDING_UPDATE_KEY, '');
    } catch (error) {
      void logError(`update install failed: ${error instanceof Error ? error.message : 'unknown'}`);
      // Ladder exhausted (FileProvider -> sharing -> browser all failed): surface the same
      // user-visible error + retry state as a download failure instead of silently re-showing
      // the ready status forever.
      if (mountedRef.current) setDownload((state) => nextDownloadState(state, { type: 'error', message: uk.updateChecker.downloadError }));
    }
  };

  const mountedRef = React.useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const runDownload = async (manifest: UpdateManifest) => {
    if (!mountedRef.current) return;
    setDownload({ phase: 'downloading', percent: 0, errorMessage: null });
    const filePath = expectedApkCacheUri();
    const pending = { versionCode: manifest.versionCode, url: manifest.url, filePath, phase: 'downloading' };
    try {
      parentSessionStore.touch();
      const file = await downloadApk(manifest, (percent) => {
        parentSessionStore.touch();
        if (mountedRef.current) setDownload((state) => nextDownloadState(state, { type: 'progress', percent }));
      });
      if (!mountedRef.current) return;
      setDownload((state) => nextDownloadState(state, { type: 'verifying' }));
      // downloadApk performs native streaming SHA-256 verification before returning.
      // Persist only a confirmed, re-installable 'ready' record so a failed attempt can retry from a clean slate.
      await settingsRepo.set(PENDING_UPDATE_KEY, JSON.stringify({ ...pending, filePath: file.uri, phase: 'ready' }));
      setDownload({ phase: 'ready', percent: 100, errorMessage: null });
      await runInstall(manifest, file);
    } catch (error) {
      void logError('update download failed');
      void settingsRepo.set(PENDING_UPDATE_KEY, '');
      if (mountedRef.current) setDownload((state) => nextDownloadState(state, { type: 'error', message: uk.updateChecker.downloadError }));
    }
  };

  const installReady = async () => {
    try {
      const raw = await settingsRepo.get(PENDING_UPDATE_KEY);
      if (!raw || !mountedRef.current || !update) return;
      const pending = JSON.parse(raw) as { versionCode: number; url: string; filePath: string; phase: string };
      if (pending.phase !== 'ready' || pending.versionCode !== update?.versionCode || pending.url !== update.url) return;
      const file = openCachedApk(pending.filePath);
      if (!file.exists) throw new Error('Cached update file is missing');
      await runInstall(update, file);
    } catch (error) {
      void logError(`update install resume failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  };

  if (!update) return null;
  const message = uk.updateChecker.message.replace('{versionName}', update.versionName);
  const busy = download.phase === 'downloading' || download.phase === 'verifying';
  const status = download.phase === 'downloading'
    ? uk.updateChecker.downloading.replace('{percent}', String(download.percent))
    : download.phase === 'verifying' ? uk.updateChecker.verifying
      : download.phase === 'ready' ? uk.updateChecker.ready : null;

  return (
    <View style={styles.banner} accessibilityRole="summary" accessibilityLabel={uk.updateChecker.bannerA11y} accessibilityHint={uk.updateChecker.bannerHint}>
      <AppText variant="body" style={styles.message} accessibilityRole="text" accessibilityLabel={uk.updateChecker.messageA11y.replace('{versionName}', update.versionName)} accessibilityHint={uk.updateChecker.messageHint}>
        {message}
      </AppText>
      {status && <AppText variant="caption" style={styles.status} accessibilityLiveRegion="polite">{status}</AppText>}
      {download.phase === 'error' && <AppText variant="caption" style={styles.error} accessibilityLiveRegion="assertive">{download.errorMessage ?? uk.updateChecker.downloadError}</AppText>}
      <View style={styles.actions}>
        {download.phase === 'error' ? (
          <>
            <TapTarget accessibilityRole="button" accessibilityLabel={uk.updateChecker.retryA11y} accessibilityHint={uk.updateChecker.retryHint} size="sm" onPress={() => {
              setDownload(nextDownloadState(download, { type: 'retry' }));
              void runDownload(update);
            }} style={styles.primaryAction}>
              <AppText variant="caption" style={styles.primaryText}>{uk.updateChecker.retry}</AppText>
            </TapTarget>
            <TapTarget accessibilityRole="link" accessibilityLabel={uk.updateChecker.browserFallbackA11y} accessibilityHint={uk.updateChecker.browserFallbackHint} size="sm" onPress={() => {
              void Linking.openURL(update.url).then(() => settingsRepo.set(PENDING_UPDATE_KEY, '')).catch(() => {});
            }} style={styles.quietAction}>
              <AppText variant="caption" style={styles.quietText}>{uk.updateChecker.browserFallback}</AppText>
            </TapTarget>
          </>
        ) : (
          <TapTarget accessibilityRole="button" accessibilityLabel={uk.updateChecker.updateA11y} accessibilityHint={uk.updateChecker.updateHint} size="sm" disabled={busy} onPress={() => { void (download.phase === 'ready' ? installReady() : runDownload(update)); }} style={[styles.primaryAction, busy && styles.disabled]}>
            <AppText variant="caption" style={styles.primaryText}>{uk.updateChecker.update}</AppText>
          </TapTarget>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { width: '100%', borderWidth: 1, borderColor: colors.accent, borderRadius: 8, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm },
  message: { color: colors.text },
  status: { color: colors.textSecondary },
  error: { color: colors.dangerText },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  primaryAction: { paddingHorizontal: spacing.md, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  primaryText: { color: colors.text, fontWeight: typographyWeights.bodyLarge },
  quietAction: { paddingHorizontal: spacing.sm },
  quietText: { color: colors.textSecondary },
  disabled: { opacity: 0.5 },
});
