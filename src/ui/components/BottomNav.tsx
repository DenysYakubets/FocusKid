import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { TapTarget } from './TapTarget';
import { MIN_TOUCH_DP, colors, radius, spacing } from '../theme';

export interface BottomNavTab<T extends string> {
  key: T;
  label: string;
}

export interface BottomNavProps<T extends string> {
  active: T;
  tabs: readonly BottomNavTab<T>[];
  onChange: (key: T) => void;
  testID?: string;
}

/**
 * F6: bottom navigation of the child flow. Two tabs rendered with the repo's
 * own primitives (no new dependency): each tab is a `TapTarget` at the 48dp
 * INV-10 floor with `accessibilityRole="tab"`, and the selected state is
 * carried by background + an indicator bar as well as colour.
 */
export function BottomNav<T extends string>({
  active,
  tabs,
  onChange,
  testID,
}: BottomNavProps<T>) {
  return (
    <View testID={testID ?? 'bottom-nav'} style={styles.bar}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <TapTarget
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, isActive && styles.tabActive]}
          >
            <AppText
              variant="body"
              style={[styles.tabLabel, isActive && styles.tabLabelActive]}
            >
              {tab.label}
            </AppText>
            <View style={[styles.indicator, isActive ? styles.indicatorActive : null]} />
          </TapTarget>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    minHeight: MIN_TOUCH_DP,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    gap: spacing.xs,
  },
  tabActive: {
    backgroundColor: colors.surfaceAlt,
  },
  tabLabel: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  indicator: {
    width: '45%',
    height: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: 'transparent',
  },
  indicatorActive: {
    backgroundColor: colors.primary,
  },
});