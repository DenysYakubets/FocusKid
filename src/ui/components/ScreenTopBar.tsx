import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { TapTarget } from './TapTarget';
import { colors, spacing } from '../theme';
import { uk } from '../../i18n/uk';

export interface ScreenTopBarProps {
  onBack?: () => void;
  /** Visible chip text is `← backLabel`; the a11y label stays `backLabel`. */
  backLabel?: string;
  title?: string;
  /** Row B — always forced onto its own full-width row (flexBasis 100%). */
  actions?: React.ReactNode;
  testID?: string;
  titleTestID?: string;
}

/**
 * Wrapping top bar (Row A: back chip + title, Row B: primary action).
 * The wrapping container + flexBasis row is what keeps a form's primary action
 * out from under the keyboard and pins the layout at 320dp.
 */
export function ScreenTopBar({
  onBack,
  backLabel = uk.timer.back,
  title,
  actions,
  testID,
  titleTestID,
}: ScreenTopBarProps) {
  const actionNodes = actions
    ? React.Children.map(actions, (child) => {
        if (React.isValidElement<{ style?: StyleProp<ViewStyle> }>(child)) {
          return React.cloneElement(child, {
            style: [child.props.style, styles.actionRow] as StyleProp<ViewStyle>,
          });
        }
        return child;
      })
    : null;

  return (
    <View testID={testID} style={styles.container}>
      {onBack ? (
        <TapTarget
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          size="sm"
          style={styles.backChip}
        >
          <AppText variant="body" style={styles.backText}>
            {`← ${backLabel}`}
          </AppText>
        </TapTarget>
      ) : null}

      {title !== undefined ? (
        <AppText
          testID={titleTestID}
          variant="title"
          accessibilityRole="header"
          numberOfLines={1}
          style={styles.title}
        >
          {title}
        </AppText>
      ) : null}

      {actionNodes}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: spacing.sm,
    columnGap: spacing.sm,
  },
  backChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  backText: {
    color: colors.primary,
  },
  title: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    color: colors.text,
  },
  actionRow: {
    flexBasis: '100%',
  },
});