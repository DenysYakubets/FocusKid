import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from '../ui/components/AppText';
import { NoticeBox } from '../ui/components/NoticeBox';
import { TapTarget } from '../ui/components/TapTarget';
import { useJingle } from '../ui/hooks/useJingle';
import { useMascot } from '../ui/hooks/useMascot';
import { useScreenGutter } from '../ui/hooks/useScreenGutter';
import { playJingle } from '../audio/celebrationSound';
import { mascotImages } from '../ui/mascotImages';
import { MASCOTS, MascotName, mascotColor } from '../ui/mascotRoster';
import { colors, radius, shadows, spacing } from '../ui/theme';
import { uk } from '../i18n/uk';

/**
 * C5 (MASCOT_DESIGN §4): the child picks one of the 7 companions.
 *
 * - responsive grid: 1 column at the 320dp class, 2 columns from 366dp up.
 * - tapping a card previews it in the panel above AND persists the choice in
 *   the settings store (the floating companion is hidden here — the roster is
 *   the focus, §6).
 * - selected card: mascot-colored border + checkmark + `accessibilityState`.
 * - every string comes from `src/i18n/uk.ts`; every color from theme tokens.
 */
export function MascotSelectScreen() {
  const { mascot, select } = useMascot();
  const { volume, enabled, setVolume } = useJingle();
  const { width, gutter } = useScreenGutter();

  const columns = width < 340 ? 1 : 2;
  const previewSize = columns === 1 ? 128 : 96;
  const flexBasis: ViewStyle['flexBasis'] = columns === 1 ? '100%' : '48%';

  // Last tapped card wins the preview; before any tap the persisted choice is
  // shown (it may still be hydrating from the settings store).
  const [tapped, setTapped] = useState<MascotName | null>(null);
  const [saveError, setSaveError] = useState(false);
  // C8: jingle volume write failures get their own box (JINGLE_DESIGN §3.3).
  const [jingleSaveError, setJingleSaveError] = useState(false);
  const shown = tapped ?? mascot;
  const pct = Math.round(volume * 100);

  const handlePick = (name: MascotName) => {
    setTapped(name);
    setSaveError(false);
    // Round-1 LOW: select() rethrows when the settings write fails — catch it
    // here (the store already rolled the visible choice back) instead of
    // leaving an unhandled rejection.
    void select(name).catch(() => setSaveError(true));
  };

  // C8: 10% stepper steps, clamped by the store; the store rolls the visible
  // value back and rethrows if the settings write fails.
  const handleVolumeStep = (delta: number) => {
    setJingleSaveError(false);
    void setVolume(volume + delta).catch(() => setJingleSaveError(true));
  };

  // Test previews the mascot currently shown in the panel at the chosen volume.
  const handleJingleTest = () => {
    playJingle(shown, volume);
  };

  return (
    <ScrollView
      testID="mascot-select"
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
    >
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header" style={styles.title}>
          {uk.mascot.title}
        </AppText>
        <AppText variant="body" style={styles.hint}>
          {uk.mascot.hint}
        </AppText>
      </View>

      {saveError ? (
        <NoticeBox testID="mascot-save-error" tone="error" message={uk.mascot.saveError} />
      ) : null}

      <View
        testID="mascot-preview"
        accessibilityLabel={uk.mascot.previewLabel(shown)}
        style={[styles.preview, { borderColor: mascotColor(shown) }]}
      >
        <Image
          testID="mascot-preview-image"
          source={mascotImages[shown].happy}
          style={{ width: previewSize, height: previewSize }}
          resizeMode="contain"
          accessible={false}
        />
        <AppText variant="title" style={styles.previewName}>
          {shown}
        </AppText>
        <AppText variant="caption" numberOfLines={2} style={styles.previewPersonality}>
          {uk.mascot.personalities[shown]}
        </AppText>
      </View>

      {/* C8 (JINGLE_DESIGN §3.3): jingle volume stepper + Test preview, right
          under the preview panel so it sits "near mascot selection". TapTarget
          steppers = zero new deps and the 48dp INV-10 floor for free. */}
      <View testID="jingle-volume" style={styles.jingleRow}>
        <AppText
          variant="body"
          testID="jingle-volume-value"
          accessibilityRole="text"
          accessibilityLabel={uk.mascot.jingleVolume(pct)}
          style={styles.jingleValue}
        >
          {uk.mascot.jingleVolume(pct)}
        </AppText>
        <View style={styles.jingleControls}>
          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.mascot.jingleVolumeStepDown}
            testID="jingle-volume-down"
            size="sm"
            style={styles.jingleButton}
            onPress={() => handleVolumeStep(-0.1)}
          >
            <AppText variant="bodyLarge">−</AppText>
          </TapTarget>
          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.mascot.jingleVolumeStepUp}
            testID="jingle-volume-up"
            size="sm"
            style={styles.jingleButton}
            onPress={() => handleVolumeStep(0.1)}
          >
            <AppText variant="bodyLarge">+</AppText>
          </TapTarget>
          {/* JINGLE_DESIGN §3.3 testID table: Test is disabled ONLY when
              `jingle_enabled === false` (round-1 LOW — the extra volume === 0
              gate was an undocumented deviation; volume 0 simply plays
              silence). */}
          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.mascot.jingleTest}
            testID="jingle-test"
            size="sm"
            style={styles.jingleButton}
            disabled={!enabled}
            onPress={handleJingleTest}
          >
            <AppText variant="bodyLarge">{uk.mascot.jingleTest}</AppText>
          </TapTarget>
        </View>
      </View>

      {/* Round-1 LOW: the disabled-jingle state gets a visible notice —
          `uk.mascot.jingleDisabled` was a dead string until now. */}
      {!enabled ? (
        <NoticeBox
          testID="jingle-disabled"
          tone="info"
          message={uk.mascot.jingleDisabled}
        />
      ) : null}

      {jingleSaveError ? (
        <NoticeBox
          testID="jingle-save-error"
          tone="error"
          message={uk.mascot.jingleSaveError}
        />
      ) : null}

      <View style={styles.grid}>
        {MASCOTS.map((name) => {
          const selected = name === mascot;
          return (
            <TapTarget
              key={name}
              accessibilityRole="button"
              accessibilityLabel={uk.mascot.cardLabel(name)}
              accessibilityState={{ selected }}
              onPress={() => handlePick(name)}
              style={[
                styles.card,
                { flexBasis },
                selected && styles.cardSelected,
                { borderColor: selected ? mascotColor(name) : colors.borderStrong },
              ]}
            >
              <Image
                testID={`mascot-card-${name}`}
                source={mascotImages[name].happy}
                style={{ width: previewSize, height: previewSize }}
                resizeMode="contain"
                accessible={false}
              />
              <AppText variant="body" style={styles.cardName}>
                {name}
              </AppText>
              <AppText variant="caption" numberOfLines={2} style={styles.cardPersonality}>
                {uk.mascot.personalities[name]}
              </AppText>
              {selected ? (
                <AppText variant="body" style={styles.cardSelectedText}>
                  {`✓ ${uk.mascot.selected}`}
                </AppText>
              ) : null}
            </TapTarget>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: spacing.lg,
    gap: spacing.lg,
    alignItems: 'stretch',
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
  },
  hint: {
    color: colors.textSecondary,
  },
  preview: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    boxShadow: shadows.card,
  },
  previewName: {
    color: colors.text,
  },
  previewPersonality: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    flexGrow: 1,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    boxShadow: shadows.card,
  },
  cardSelected: {
    borderWidth: 2,
  },
  cardName: {
    color: colors.text,
    textAlign: 'center',
  },
  cardPersonality: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cardSelectedText: {
    color: colors.verified,
  },
  jingleRow: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  jingleValue: {
    color: colors.text,
    textAlign: 'center',
  },
  jingleControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  jingleButton: {
    paddingHorizontal: spacing.md,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
});