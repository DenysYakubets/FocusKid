import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { CalendarScreen } from './CalendarScreen';
import { TodayScreen } from './TodayScreen';
import { BottomNav, BottomNavTab } from '../ui/components/BottomNav';
import { colors } from '../ui/theme';
import { uk } from '../i18n/uk';

type Props = NativeStackScreenProps<RootStackParamList, 'Today'>;

export type ChildTabKey = 'tasks' | 'calendar';

const TABS: readonly BottomNavTab<ChildTabKey>[] = [
  { key: 'tasks', label: uk.nav.tasks },
  { key: 'calendar', label: uk.nav.calendar },
];

/**
 * F6: the child flow now has a bottom navigation with two modes — the existing
 * Today/Timer flow and the new Calendar. The stack route keeps its `Today` name
 * (so back navigation, guards and tests stay untouched); this shell only swaps
 * which child is mounted and renders the tab bar under it.
 */
export function ChildTabsScreen({ route, navigation }: Props) {
  const [tab, setTab] = useState<ChildTabKey>('tasks');

  return (
    <View testID="child-tabs" style={styles.root}>
      <View style={styles.content}>
        {tab === 'tasks' ? (
          <TodayScreen route={route} navigation={navigation} />
        ) : (
          <CalendarScreen route={route} navigation={navigation} />
        )}
      </View>
      <BottomNav
        testID="child-tab-bar"
        active={tab}
        tabs={TABS}
        onChange={setTab}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
});