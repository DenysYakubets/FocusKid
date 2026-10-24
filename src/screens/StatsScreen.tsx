import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { parentSessionStore } from '../state/parentSessionStore';
import { ParentGuard } from '../navigation/ParentGuard';
import { WeekSummary, TaskStat } from '../domain/stats/aggregate';
import { AppText } from '../ui/components/AppText';
import { AppToolbar } from '../ui/components/AppToolbar';
import { StatBar } from '../ui/components/StatBar';
import { useOrientation } from '../ui/hooks/useOrientation';
import { uk } from '../i18n/uk';
import { colors, radius, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Stats'>;

export function StatsScreen({ navigation }: Props) {
  const { statsService } = useServices();
  const orientation = useOrientation();
  const isLandscape = orientation === 'landscape';

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [taskStats, setTaskStats] = useState<TaskStat[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function loadStats() {
      try {
        const [sum, tasks] = await Promise.all([
          statsService.weekSummary(),
          statsService.weekTaskStats(),
        ]);
        if (isMounted) {
          setSummary(sum);
          setTaskStats(tasks);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadStats();
    const unsub = navigation.addListener('focus', () => {
      parentSessionStore.touch();
      void loadStats();
    });
    return () => {
      isMounted = false;
      unsub();
    };
  }, [navigation, statsService]);

  const isEmpty = !summary || (summary.totalVerified === 0 && summary.totalMinutes === 0);

  const maxDayMinutes = summary
    ? Math.max(...summary.days.map((d) => d.focusedMinutes), 60)
    : 60;

  const totalsNode = (
    <View style={styles.totalsContainer}>
      <View style={styles.totalCard}>
        <AppText variant="body" style={styles.totalLabel}>
          {uk.stats.totalVerified}
        </AppText>
        <AppText variant="display" style={styles.totalValue}>
          {String(summary?.totalVerified ?? 0)}
        </AppText>
      </View>

      <View style={styles.totalCard}>
        <AppText variant="body" style={styles.totalLabel}>
          {uk.stats.totalMinutes}
        </AppText>
        <AppText variant="display" style={styles.totalValue}>
          {String(summary?.totalMinutes ?? 0)}
        </AppText>
      </View>
    </View>
  );

  const daysNode = (
    <View style={styles.daysSection}>
      {summary?.days.map((day, idx) => {
        const shortDay = uk.stats.shortWeekdays[idx] ?? day.localDate;
        const fullDay = uk.stats.weekdays[idx] ?? day.localDate;
        return (
          <StatBar
            key={day.localDate}
            label={shortDay}
            fullDayName={fullDay}
            verifiedCount={day.verified}
            minutes={day.focusedMinutes}
            maxMinutes={maxDayMinutes}
          />
        );
      })}
    </View>
  );

  const taskListNode = (
    <View style={styles.taskList}>
      {taskStats.map((task) => (
        <View key={task.taskId} style={styles.taskCard}>
          <AppText variant="body" style={styles.taskTitle}>
            {task.emoji ? `${task.emoji} ${task.title}` : task.title}
          </AppText>
          <AppText variant="body" style={styles.taskMinutes}>
            {`${task.minutes} хв`}
          </AppText>
        </View>
      ))}
    </View>
  );

  const taskSectionNode = (
    <View style={styles.taskSection}>
      <AppText variant="title" accessibilityRole="header" style={styles.sectionHeader}>
        {uk.stats.tasksHeader}
      </AppText>
      {taskListNode}
    </View>
  );

  return (
    <ParentGuard navigation={navigation}>
      <View
        testID={isLandscape ? 'stats-layout-landscape' : 'stats-layout-portrait'}
        style={[styles.container, isLandscape && styles.containerLandscape]}
      >
        <AppToolbar onBack={() => navigation.goBack()} title={uk.stats.title} />

        {loading ? (
          <View style={styles.centerBox}>
            <AppText variant="body" style={styles.secondaryText}>
              {uk.loading}
            </AppText>
          </View>
        ) : isEmpty ? (
          <View style={styles.centerBox}>
            <AppText variant="body" style={styles.emptyText}>
              {uk.stats.empty}
            </AppText>
          </View>
        ) : isLandscape ? (
          /* Landscape 2-column layout: totals+days | per-task */
          <View style={styles.landscapeRow}>
            <ScrollView
              style={styles.column}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              onScroll={() => parentSessionStore.touch()}
              scrollEventThrottle={1000}
            >
              {totalsNode}
              {daysNode}
            </ScrollView>

            <ScrollView
              style={styles.column}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              onScroll={() => parentSessionStore.touch()}
              scrollEventThrottle={1000}
            >
              {taskSectionNode}
            </ScrollView>
          </View>
        ) : (
          /* Portrait 1-column layout */
          <ScrollView
            style={styles.singleScroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={() => parentSessionStore.touch()}
            scrollEventThrottle={1000}
          >
            {totalsNode}
            {daysNode}
            {taskStats.length > 0 ? taskSectionNode : null}
          </ScrollView>
        )}
        {/* Round-1 MED / INV-05: no companion here. Statistics is a
            parent-only screen — the C5 brief's "bottom-left Stats" contradicted
            INV-05/AS-19 ("statistics are parent-only"), and the orchestrator
            resolved it in favour of the invariant: the companion is a child-side
            affordance only. Rationale recorded in docs/UX_FIXES_NOTES.md. */}
      </View>
    </ParentGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  containerLandscape: {
    padding: spacing.xl,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  secondaryText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  singleScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  landscapeRow: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xl,
  },
  column: {
    flex: 1,
  },
  totalsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  totalCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.xs,
  },
  totalLabel: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  totalValue: {
    color: colors.primary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  daysSection: {
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  taskSection: {
    gap: spacing.md,
  },
  sectionHeader: {
    color: colors.text,
  },
  taskList: {
    gap: spacing.sm,
  },
  taskCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    rowGap: spacing.xs,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
  },
  taskTitle: {
    color: colors.text,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  taskMinutes: {
    color: colors.textSecondary,
    flexShrink: 0,
  },
});