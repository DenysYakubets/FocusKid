import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { CalendarScreen } from './CalendarScreen';
import { TodayScreen } from './TodayScreen';
import { MascotSelectScreen } from './MascotSelectScreen';
import { BottomNav, BottomNavTab } from '../ui/components/BottomNav';
import { MascotFloating } from '../ui/components/MascotFloating';
import { colors } from '../ui/theme';
import { uk } from '../i18n/uk';

type Props = NativeStackScreenProps<RootStackParamList, 'Today'>;

export type ChildTabKey = 'tasks' | 'calendar' | 'mascot';

const TABS: readonly BottomNavTab<ChildTabKey>[] = [
  { key: 'tasks', label: uk.nav.tasks },
  { key: 'calendar', label: uk.nav.calendar },
  { key: 'mascot', label: uk.mascot.tab },
];

/**
 * F6: the child flow now has a bottom navigation with two modes — the existing
 * Today/Timer flow and the new Calendar. The stack route keeps its `Today` name
 * (so back navigation, guards and tests stay untouched); this shell only swaps
 * which child is mounted and renders the tab bar under it.
 *
 * C5: a third tab opens the mascot selection screen, and the floating
 * companion overlays the content tabs (bottom-right, above the tab bar). The
 * companion is NOT rendered on the selection tab — the roster is the focus
 * there (MASCOT_DESIGN §6) — and NOT while the Calendar day sheet is open,
 * whose right-aligned «Перевірити» lives in the mascot's corner (round-1 MED).
 */
export function ChildTabsScreen({ route, navigation }: Props) {
  const [tab, setTab] = useState<ChildTabKey>('tasks');
  const [dayDetailOpen, setDayDetailOpen] = useState(false);

  return (
    <View testID="child-tabs" style={styles.root}>
      <View style={styles.content}>
        {tab === 'tasks' ? (
          <TodayScreen route={route} navigation={navigation} />
        ) : tab === 'calendar' ? (
          <CalendarScreen
            route={route}
            navigation={navigation}
            onDayDetailChange={setDayDetailOpen}
          />
        ) : (
          <MascotSelectScreen />
        )}

        {tab === 'mascot' || dayDetailOpen ? null : (
          <MascotFloating corner="bottom-right" />
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