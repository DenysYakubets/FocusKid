import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { TapTarget } from './TapTarget';
import { colors, radius, spacing } from '../theme';
import { uk } from '../../i18n/uk';

export interface AppToolbarProps {
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
 * C2: the shared top toolbar for child screens (Timer, TaskEdit, TaskListEdit,
 * Stats, PinGate). A clear title (never wraps) sits in the center; the back
 * button is a distinct 48dp+ chip with `← {backLabel}` so it never blends into
 * the title. The whole row is 56dp high (the INV-10 touch floor is 48dp).
 */
export function AppToolbar({
  onBack,
  backLabel = uk.timer.back,
  title,
  actions,
  testID,
  titleTestID,
}: AppToolbarProps) {
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
          size="md"
          style={styles.backButton}
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
    minHeight: 56,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: spacing.sm,
    columnGap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
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