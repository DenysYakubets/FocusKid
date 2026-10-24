import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { DaySessionStat, DayStat } from '../services/stats/statsService';
import { useServices } from '../state/appServices';
import {
  MonthGrid,
  addMonths,
  buildMonthGrid,
  parseDate,
} from '../domain/stats/calendar';
import { AppButton } from '../ui/components/AppButton';
import { AppText } from '../ui/components/AppText';
import { StatusChip } from '../ui/components/StatusChip';
import { TapTarget } from '../ui/components/TapTarget';
import { useScreenGutter } from '../ui/hooks/useScreenGutter';
import { uk } from '../i18n/uk';
import { MIN_TOUCH_DP, colors, radius, shadows, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Today'>;

/**
 * F6: the Calendar tab of the child flow. Data comes from the existing
 * `statsService` (which reads the single `sessions` table) — approved sessions
 * are green, pending ones get the warning marker, and the header shows minutes
 * earned this week / this month. Approving always routes through the parent
 * PIN gate (INV-05); this screen never verifies anything by itself.
 */
export function CalendarScreen({ navigation }: Props) {
  const { statsService, wall } = useServices();
  const { gutter, isLandscape } = useScreenGutter();

  const [anchor, setAnchor] = useState<string>(() => buildAnchor(wall.todayLocalDate()));
  const [weekMinutes, setWeekMinutes] = useState(0);
  const [monthMinutes, setMonthMinutes] = useState(0);
  const [days, setDays] = useState<DayStat[]>([]);
  const [grid, setGrid] = useState<MonthGrid | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [daySessions, setDaySessions] = useState<DaySessionStat[]>([]);

  const reload = useCallback(async () => {
    try {
      const today = wall.todayLocalDate();
      const [week, month] = await Promise.all([
        statsService.weekSummary(today),
        statsService.monthSummary(anchor),
      ]);
      setWeekMinutes(week.totalMinutes);
      setMonthMinutes(month.verifiedMinutes);
      setDays(month.days);
      setGrid(buildMonthGrid(anchor, wall.weekdayIndex(anchor)));
    } catch {
      // Keep the last known data on screen; the four-state rule is handled by
      // the empty markers below (data is local and synchronous in practice).
    }
  }, [statsService, wall, anchor]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', () => {
      void reload();
    });
    return () => {
      unsubscribe?.();
    };
  }, [navigation, reload]);

  const openDay = async (localDate: string) => {
    setSelectedDay(localDate);
    setDaySessions(await statsService.daySessions(localDate));
  };

  const changeMonth = (delta: number) => {
    setAnchor(addMonths(anchor, delta));
    setSelectedDay(null);
    setDaySessions([]);
  };

  const { year: anchorYear, month: anchorMonth } = parseDate(anchor);
  const monthLabel = `${uk.calendar.months[anchorMonth - 1]} ${anchorYear}`;

  const statFor = (localDate: string): DayStat | undefined =>
    days.find((d) => d.localDate === localDate);

  const renderDay = (localDate: string) => {
    const stat = statFor(localDate);
    const verified = stat?.verified ?? 0;
    const pending = stat?.pending ?? 0;
    const isApproved = verified > 0;
    const isPending = !isApproved && pending > 0;
    const { day } = parseDate(localDate);
    const dayLabel = `${day} ${uk.calendar.months[anchorMonth - 1]}`;
    const a11yLabel = `${dayLabel}: ${verified} ${uk.calendar.dayVerified}, ${pending} ${uk.calendar.dayPending}`;

    return (
      <TapTarget
        key={localDate}
        testID={`calendar-day-${localDate}`}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        onPress={() => {
          void openDay(localDate);
        }}
        style={[
          styles.dayCell,
          isApproved ? styles.dayCellApproved : null,
          isPending ? styles.dayCellPending : null,
          selectedDay === localDate ? styles.dayCellSelected : null,
        ]}
      >
        <AppText
          variant="body"
          style={[
            styles.dayNumber,
            isApproved ? styles.dayNumberOnColor : null,
            isPending ? styles.dayNumberOnColor : null,
          ]}
        >
          {String(day)}
        </AppText>
      </TapTarget>
    );
  };

  return (
    <View
      testID={isLandscape ? 'calendar-layout-landscape' : 'calendar-layout-portrait'}
      style={[styles.container, { paddingHorizontal: gutter }]}
    >
      <View testID="calendar-header" style={styles.header}>
        <AppText variant="title" accessibilityRole="header" style={styles.title}>
          {uk.calendar.title}
        </AppText>
        <View style={styles.monthRow}>
          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.calendar.prevMonth}
            onPress={() => changeMonth(-1)}
            style={styles.monthButton}
          >
            <AppText variant="heading" style={styles.monthButtonText}>
              ‹
            </AppText>
          </TapTarget>
          <AppText variant="heading" style={styles.monthLabel}>
            {monthLabel}
          </AppText>
          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.calendar.nextMonth}
            onPress={() => changeMonth(1)}
            style={styles.monthButton}
          >
            <AppText variant="heading" style={styles.monthButtonText}>
              ›
            </AppText>
          </TapTarget>
        </View>
      </View>

      {/* Minutes earned: this week and this month (parent reads them directly). */}
      <View testID="calendar-summary" style={styles.summary}>
        <View style={styles.summaryBox}>
          <AppText variant="caption" style={styles.summaryLabel}>
            {uk.calendar.weekEarned}
          </AppText>
          <AppText variant="display" style={styles.summaryValue}>
            {`${weekMinutes} ${uk.calendar.minutesUnit}`}
          </AppText>
        </View>
        <View style={styles.summaryBox}>
          <AppText variant="caption" style={styles.summaryLabel}>
            {uk.calendar.monthEarned}
          </AppText>
          <AppText variant="display" style={styles.summaryValue}>
            {`${monthMinutes} ${uk.calendar.minutesUnit}`}
          </AppText>
        </View>
      </View>

      {/* The 7-column month grid scrolls horizontally so every day keeps a
          48dp touch target even at 320dp (INV-10). */}
      <ScrollView
        horizontal
        style={styles.gridScroll}
        contentContainerStyle={styles.gridScrollContent}
      >
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            {uk.stats.shortWeekdays.map((label) => (
              <View key={label} style={styles.weekdayCell}>
                <AppText variant="caption" style={styles.weekdayText}>
                  {label}
                </AppText>
              </View>
            ))}
          </View>

          {(grid?.rows ?? []).map((row, rowIndex) => (
            <View key={`week-${rowIndex}`} style={styles.gridRow}>
              {row.map((cell, cellIndex) =>
                cell === null ? (
                  <View key={`blank-${cellIndex}`} style={styles.dayCell} />
                ) : (
                  renderDay(cell)
                )
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <AppText variant="caption" style={styles.hint}>
        {uk.calendar.dayHint}
      </AppText>

      {selectedDay !== null ? (
        <ScrollView
          testID="calendar-day-detail"
          style={styles.detailCard}
          contentContainerStyle={styles.detailContent}
        >
          <View style={styles.detailHeader}>
            <AppText variant="title" accessibilityRole="header" style={styles.detailTitle}>
              {`${Number(selectedDay.slice(8, 10))} ${uk.calendar.months[parseDate(selectedDay).month - 1]}`}
            </AppText>
            <AppButton
              label={uk.calendar.close}
              variant="ghost"
              size="sm"
              onPress={() => {
                setSelectedDay(null);
                setDaySessions([]);
              }}
            />
          </View>

          {daySessions.length === 0 ? (
            <AppText variant="body" style={styles.detailEmpty}>
              {uk.calendar.dayEmpty}
            </AppText>
          ) : (
            daySessions.map((session) => (
              <View key={session.sessionId} style={styles.detailRow}>
                <View style={styles.detailRowText}>
                  <View style={styles.detailRowTitle}>
                    {session.emoji ? (
                      <AppText variant="body">{session.emoji}</AppText>
                    ) : null}
                    <AppText variant="body" style={styles.detailTaskTitle}>
                      {session.title}
                    </AppText>
                  </View>
                  <AppText variant="caption" style={styles.detailMeta}>
                    {`${session.minutes} ${uk.calendar.minutesUnit}`}
                  </AppText>
                </View>
                <StatusChip
                  status={session.status === 'verified' ? 'verified' : 'awaiting'}
                />
                {session.status === 'completed' ? (
                  <AppButton
                    label={uk.parentHome.verify}
                    variant="primary"
                    size="md"
                    onPress={() =>
                      navigation.navigate('PinGate', {
                        intent: 'verify',
                        sessionId: session.sessionId,
                      })
                    }
                  />
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** Month anchor derived from a local date without touching `Date`. */
function buildAnchor(localDate: string): string {
  return `${localDate.slice(0, 7)}-01`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  monthButton: {
    minWidth: MIN_TOUCH_DP,
    minHeight: MIN_TOUCH_DP,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  monthButtonText: {
    color: colors.primary,
  },
  monthLabel: {
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  summary: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    alignItems: 'center',
  },
  summaryLabel: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  summaryValue: {
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  gridScroll: {
    flexGrow: 0,
  },
  gridScrollContent: {
    paddingRight: spacing.md,
  },
  grid: {
    gap: spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  weekdayCell: {
    width: MIN_TOUCH_DP,
    minHeight: MIN_TOUCH_DP,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekdayText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  dayCell: {
    width: MIN_TOUCH_DP,
    minHeight: MIN_TOUCH_DP,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCellApproved: {
    backgroundColor: colors.verified,
    borderColor: colors.verified,
  },
  dayCellPending: {
    backgroundColor: colors.awaiting,
    borderColor: colors.awaiting,
  },
  dayCellSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  dayNumber: {
    color: colors.text,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  dayNumberOnColor: {
    color: colors.white,
    fontWeight: '700',
  },
  hint: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  detailCard: {
    maxHeight: 280,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadows.card,
  },
  detailContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    columnGap: spacing.sm,
  },
  detailTitle: {
    color: colors.text,
    flexShrink: 1,
  },
  detailEmpty: {
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  detailRow: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
  },
  detailRowText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
    columnGap: spacing.sm,
  },
  detailRowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  detailTaskTitle: {
    color: colors.text,
    flexShrink: 1,
  },
  detailMeta: {
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});