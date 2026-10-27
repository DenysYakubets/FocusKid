import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useServices } from '../../state/appServices';
import { MANIFEST_URL, isNewerVersion, parseUpdateManifest, UpdateManifest } from '../../services/update/checkForUpdate';
import { uk } from '../../i18n/uk';
import { AppText } from './AppText';
import { TapTarget } from './TapTarget';
import { colors, spacing, typographyWeights } from '../theme';

const DISMISSED_UPDATE_KEY = '@focuskid/update-dismissed-version-code';
const FETCH_TIMEOUT_MS = 5000;

export function UpdateChecker() {
  const { settingsRepo } = useServices();
  const [update, setUpdate] = useState<UpdateManifest | null>(null);

  useEffect(() => {
    let mounted = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      try {
        const storedDismissed = await settingsRepo.get(DISMISSED_UPDATE_KEY);
        const dismissedCode = Number.parseInt(storedDismissed ?? '0', 10) || 0;
        // Constants.nativeBuildVersion is the fallback for environments without expo-application.
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
        if (
          manifest && isNewerVersion(manifest.versionCode, currentCode) &&
          isNewerVersion(manifest.versionCode, dismissedCode)
        ) setUpdate(manifest);
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
  }, [settingsRepo]);

  if (!update) return null;
  const message = uk.updateChecker.message.replace('{versionName}', update.versionName);

  return (
    <View
      style={styles.banner}
      accessibilityRole="summary"
      accessibilityLabel={uk.updateChecker.bannerA11y}
      accessibilityHint={uk.updateChecker.bannerHint}
    >
      <AppText
        variant="caption"
        style={styles.message}
        accessibilityRole="text"
        accessibilityLabel={uk.updateChecker.messageA11y.replace('{versionName}', update.versionName)}
        accessibilityHint={uk.updateChecker.messageHint}
      >
        {message}
      </AppText>
      <View style={styles.actions}>
        <TapTarget
          accessibilityRole="button"
          accessibilityLabel={uk.updateChecker.updateA11y}
          accessibilityHint={uk.updateChecker.updateHint}
          size="sm"
          onPress={() => { void Linking.openURL(update.url).catch(() => {}); }}
          style={styles.updateAction}
        >
          <AppText variant="caption" style={styles.updateText}>{uk.updateChecker.update}</AppText>
        </TapTarget>
        <TapTarget
          accessibilityRole="button"
          accessibilityLabel={uk.updateChecker.laterA11y}
          accessibilityHint={uk.updateChecker.laterHint}
          size="sm"
          onPress={() => {
            void settingsRepo.set(DISMISSED_UPDATE_KEY, String(update.versionCode)).catch(() => {});
            setUpdate(null);
          }}
          style={styles.laterAction}
        >
          <AppText variant="caption" style={styles.laterText}>{uk.updateChecker.later}</AppText>
        </TapTarget>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    zIndex: 1000,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  message: { color: colors.textSecondary, flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  updateAction: { paddingHorizontal: spacing.xs, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  updateText: { color: colors.text, fontWeight: typographyWeights.bodyLarge },
  laterAction: { paddingHorizontal: spacing.xs },
  laterText: { color: colors.textSecondary },
});
