import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { parentSessionStore } from '../../state/parentSessionStore';
import { MANIFEST_URL, isNewerVersion, parseUpdateManifest, UpdateManifest } from '../../services/update/checkForUpdate';
import { downloadApk, installApk } from '../../services/update/downloadApk';
import { DownloadState, initialDownloadState, nextDownloadState } from '../../services/update/downloadState';
import { uk } from '../../i18n/uk';
import { AppText } from './AppText';
import { TapTarget } from './TapTarget';
import { colors, spacing, typographyWeights } from '../theme';

const FETCH_TIMEOUT_MS = 5000;

export function UpdateChecker() {
  const [update, setUpdate] = useState<UpdateManifest | null>(null);
  const [download, setDownload] = useState<DownloadState>(initialDownloadState);

  useEffect(() => {
    let mounted = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    async function check() {
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
        if (!response || !mounted) return;
        const manifest = parseUpdateManifest(response);
        if (manifest && isNewerVersion(manifest.versionCode, currentCode)) setUpdate(manifest);
      } catch {
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
  }, []);

  const runDownload = async (manifest: UpdateManifest) => {
    setDownload(nextDownloadState(download, { type: 'start' }));
    try {
      parentSessionStore.touch();
      const file = await downloadApk(manifest, (percent) => {
        setDownload((state) => nextDownloadState(state, { type: 'progress', percent }));
      });
      setDownload((state) => nextDownloadState(state, { type: 'verifying' }));
      // downloadApk performs native streaming SHA-256 verification before returning.
      setDownload((state) => nextDownloadState(state, { type: 'ready' }));
      await installApk(file, manifest.url);
    } catch {
      setDownload((state) => nextDownloadState(state, { type: 'error', message: uk.updateChecker.downloadError }));
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
            <TapTarget accessibilityRole="link" accessibilityLabel={uk.updateChecker.browserFallbackA11y} accessibilityHint={uk.updateChecker.browserFallbackHint} size="sm" onPress={() => { void Linking.openURL(update.url).catch(() => {}); }} style={styles.quietAction}>
              <AppText variant="caption" style={styles.quietText}>{uk.updateChecker.browserFallback}</AppText>
            </TapTarget>
          </>
        ) : (
          <TapTarget accessibilityRole="button" accessibilityLabel={uk.updateChecker.updateA11y} accessibilityHint={uk.updateChecker.updateHint} size="sm" disabled={busy} onPress={() => { void runDownload(update); }} style={[styles.primaryAction, busy && styles.disabled]}>
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
