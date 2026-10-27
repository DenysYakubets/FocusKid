import React, { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { EmojiOption, chunkEmojis, filterEmojis } from '../../domain/tasks/emoji';
import { uk } from '../../i18n/uk';
import { MIN_TOUCH_DP, colors, radius, shadows, spacing, typography } from '../theme';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { TapTarget } from './TapTarget';

export interface EmojiPickerProps {
  /** Currently selected emoji ("" = none). */
  value: string;
  /** Tapping an emoji selects it (`null` clears the selection). */
  onSelect: (emoji: string | null) => void;
  onClose: () => void;
  testID?: string;
}

const COLUMNS = 4;

/**
 * F5: a dedicated picker dialog — curated emoji grid + a search field. The
 * system keyboard is never used to *choose* an emoji (typing emoji into a
 * TextInput proved unreliable on device), which is what made the old field feel
 * broken. Renders as a full-screen overlay, the same dialog shape PinGate uses
 * for its confirmations.
 */
export function EmojiPicker({ value, onSelect, onClose, testID }: EmojiPickerProps) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(value);
  const visible = filterEmojis(query);
  const rows = chunkEmojis(visible, COLUMNS);

  const handleSelect = (option: EmojiOption) => setDraft(option.char);

  return (
    <View testID={testID ?? 'emoji-picker'} style={styles.overlay}>
      <View style={styles.sheet}>
        <AppText variant="title" accessibilityRole="header" style={styles.title}>
          {uk.taskCrud.emojiTitle}
        </AppText>

        <TextInput
          testID="emoji-search"
          value={query}
          onChangeText={setQuery}
          placeholder={uk.taskCrud.emojiSearch}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={uk.taskCrud.emojiSearch}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />

        <ScrollView
          style={styles.gridScroll}
          contentContainerStyle={styles.gridContent}
          keyboardShouldPersistTaps="handled"
        >
          {rows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.gridRow}>
              {row.map((option) => {
                const isSelected = option.char === draft;
                return (
                  <TapTarget
                    key={option.char}
                    accessibilityRole="button"
                    accessibilityLabel={option.char}
                    onPress={() => handleSelect(option)}
                    style={[styles.cell, isSelected && styles.cellSelected]}
                  >
                    <AppText variant="title">{option.char}</AppText>
                  </TapTarget>
                );
              })}
            </View>
          ))}

          {visible.length === 0 ? (
            <AppText variant="body" style={styles.emptyText}>
              {uk.taskCrud.emojiNone}
            </AppText>
          ) : null}
        </ScrollView>

        <TextInput
          testID="emoji-custom-input"
          value={draft}
          onChangeText={setDraft}
          placeholder={uk.taskCrud.customEmojiPlaceholder}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={uk.taskCrud.customEmojiPlaceholder}
          style={styles.search}
        />

        <View style={styles.actions}>
          <AppButton
            testID="emoji-picker-save"
            label={uk.taskCrud.save}
            variant="primary"
            size="md"
            onPress={() => {
              onSelect(draft.trim() ? draft : null);
              onClose();
            }}
          />
          <AppButton
            label={uk.taskCrud.emojiClear}
            variant="secondary"
            size="md"
            onPress={() => {
              setDraft('');
            }}
          />
          <AppButton label={uk.taskCrud.cancel} variant="ghost" size="md" onPress={onClose} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    padding: spacing.sm,
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    flex: 1,
    gap: spacing.md,
  },
  title: {
    color: colors.text,
  },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: spacing.md,
    color: colors.text,
    minHeight: 56,
    fontSize: typography.body,
  },
  gridScroll: {
    flex: 1,
  },
  gridContent: {
    gap: spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cell: {
    flex: 1,
    minWidth: MIN_TOUCH_DP,
    minHeight: MIN_TOUCH_DP,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellSelected: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.primary,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  actions: {
    gap: spacing.sm,
  },
});
