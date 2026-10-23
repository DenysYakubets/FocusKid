import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { ParentGuard } from '../navigation/ParentGuard';
import { WeekSummary, TaskStat } from '../domain/stats/aggregate';
import { AppText } from '../ui/components/AppText';
import { TapTarget } from '../ui/components/TapTarget';
import { StatBar } from '../ui/components/StatBar';
import { useOrientation } from '../ui/hooks/useOrientation';
import { uk } from '../i18n/uk';
import { colors, spacing } from '../ui/theme';

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

  return (
    <ParentGuard navigation={navigation}>
      <View
        testID={isLandscape ? 'stats-layout-landscape' : 'stats-layout-portrait'}
        style={styles.container}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.timer.back}
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <AppText variant="body" style={styles.backButtonText}>
              {`← ${uk.timer.back}`}
            </AppText>
          </TapTarget>

          <AppText variant="title" accessibilityRole="header" style={styles.title}>
            {uk.stats.title}
          </AppText>
        </View>

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
          /* Landscape 2-column layout */
          <View style={styles.landscapeRow}>
            {/* Left Column: Totals + Day Bars */}
            <ScrollView
              style={styles.column}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.totalsContainer}>
                <View style={styles.totalCard}>
                  <AppText variant="body" style={styles.totalLabel}>
                    {uk.stats.totalVerified}
                  </AppText>
                  <AppText variant="title" style={styles.totalValue}>
                    {String(summary?.totalVerified ?? 0)}
                  </AppText>
                </View>

                <View style={styles.totalCard}>
                  <AppText variant="body" style={styles.totalLabel}>
                    {uk.stats.totalMinutes}
                  </AppText>
                  <AppText variant="title" style={styles.totalValue}>
                    {String(summary?.totalMinutes ?? 0)}
                  </AppText>
                </View>
              </View>

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
            </ScrollView>

            {/* Right Column: Per-Task breakdown */}
            <ScrollView
              style={styles.column}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <AppText variant="title" accessibilityRole="header" style={styles.sectionHeader}>
                {uk.stats.tasksHeader}
              </AppText>
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
            </ScrollView>
          </View>
        ) : (
          /* Portrait 1-column layout */
          <ScrollView
            style={styles.singleScroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.totalsContainer}>
              <View style={styles.totalCard}>
                <AppText variant="body" style={styles.totalLabel}>
                  {uk.stats.totalVerified}
                </AppText>
                <AppText variant="title" style={styles.totalValue}>
                  {String(summary?.totalVerified ?? 0)}
                </AppText>
              </View>

              <View style={styles.totalCard}>
                <AppText variant="body" style={styles.totalLabel}>
                  {uk.stats.totalMinutes}
                </AppText>
                <AppText variant="title" style={styles.totalValue}>
                  {String(summary?.totalMinutes ?? 0)}
                </AppText>
              </View>
            </View>

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

            {taskStats.length > 0 ? (
              <View style={styles.taskSection}>
                <AppText variant="title" accessibilityRole="header" style={styles.sectionHeader}>
                  {uk.stats.tasksHeader}
                </AppText>
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
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </ParentGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  backButton: {
    padding: spacing.sm,
  },
  backButtonText: {
    color: colors.primary,
  },
  title: {
    color: colors.text,
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
    borderRadius: 16,
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
  },
  daysSection: {
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    borderRadius: 16,
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
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taskTitle: {
    color: colors.text,
    flex: 1,
  },
  taskMinutes: {
    color: colors.textSecondary,
    marginLeft: spacing.md,
  },
});
