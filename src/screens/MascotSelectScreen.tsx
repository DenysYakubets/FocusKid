import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from '../ui/components/AppText';
import { TapTarget } from '../ui/components/TapTarget';
import { useMascot } from '../ui/hooks/useMascot';
import { useScreenGutter } from '../ui/hooks/useScreenGutter';
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
  const { width, gutter } = useScreenGutter();

  const columns = width < 340 ? 1 : 2;
  const previewSize = columns === 1 ? 128 : 96;
  const flexBasis: ViewStyle['flexBasis'] = columns === 1 ? '100%' : '48%';

  // Last tapped card wins the preview; before any tap the persisted choice is
  // shown (it may still be hydrating from the settings store).
  const [tapped, setTapped] = useState<MascotName | null>(null);
  const shown = tapped ?? mascot;

  const handlePick = (name: MascotName) => {
    setTapped(name);
    void select(name);
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
});