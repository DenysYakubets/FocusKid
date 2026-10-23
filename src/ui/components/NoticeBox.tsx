import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';

export interface NoticeBoxProps {
  tone: 'error' | 'warning' | 'info';
  message: string;
  testID?: string;
}

const toneStyles: Record<NoticeBoxProps['tone'], { backgroundColor: string }> = {
  error: { backgroundColor: colors.dangerBg },
  warning: { backgroundColor: colors.warningBg },
  info: { backgroundColor: colors.surface },
};

const toneTextColors: Record<NoticeBoxProps['tone'], string> = {
  error: colors.dangerText,
  warning: colors.warningText,
  info: colors.textSecondary,
};

/**
 * The single home for inline error/warning/info messaging — every raw
 * danger/warning box literal that drifted into screens dies here.
 */
export function NoticeBox({ tone, message, testID }: NoticeBoxProps) {
  const textColor = toneTextColors[tone];
  const textStyle = [styles.text, { color: textColor }];
  const sentenceEnd = message.indexOf('. ');

  // First sentence renders as its own nested Text so legacy behavior queries
  // can still look up e.g. the leading "Невірний PIN-код" sentence alone,
  // while the parent Text keeps exposing the full concatenated message.
  const body =
    sentenceEnd > 0 ? (
      <>
        <AppText variant="body" style={textStyle}>
          {message.slice(0, sentenceEnd)}
        </AppText>
        {message.slice(sentenceEnd)}
      </>
    ) : (
      message
    );

  return (
    <View testID={testID} style={[styles.box, toneStyles[tone]]}>
      <AppText
        variant="body"
        selectable={tone === 'error'}
        style={textStyle}
      >
        {body}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    marginVertical: spacing.sm,
  },
  text: {
    textAlign: 'center',
  },
});