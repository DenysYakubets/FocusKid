import React, { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
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

type Props = NativeStackScreenProps<RootStackParamList, 'Today'> & {
  /**
   * Round-1 MED: the child shell hides the floating companion while the
   * day-detail sheet is open — its right-aligned «Перевірити» sits exactly in
   * the mascot's bottom-right corner.
   */
  onDayDetailChange?: (open: boolean) => void;
};

/**
 * F6: the Calendar tab of the child flow. Data comes from the existing
 * `statsService` (which reads the single `sessions` table) — approved sessions
 * are green, pending ones get the warning marker, and the header shows minutes
 * earned this week / this month. Approving always routes through the parent
 * PIN gate (INV-05); this screen never verifies anything by itself.
 */
export function CalendarScreen({ navigation, onDayDetailChange }: Props) {
  const { statsService, wall } = useServices();
  const { gutter, isLandscape } = useScreenGutter();

  const [anchor, setAnchor] = useState<string>(() => buildAnchor(wall.todayLocalDate()));
  const [weekMinutes, setWeekMinutes] = useState(0);
  const [monthMinutes, setMonthMinutes] = useState(0);
  const [days, setDays] = useState<DayStat[]>([]);
  const [grid, setGrid] = useState<MonthGrid | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [daySessions, setDaySessions] = useState<DaySessionStat[]>([]);
  const [analyticsRows, setAnalyticsRows] = useState<Awaited<ReturnType<typeof statsService.analyticsSessions>>>([]);
  const [analyticsRange, setAnalyticsRange] = useState<'thisWeek' | 'last2Weeks' | 'custom'>('last2Weeks');
  const [analyticsTasks, setAnalyticsTasks] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftRange, setDraftRange] = useState(analyticsRange);
  const [draftTasks, setDraftTasks] = useState<string[]>(analyticsTasks);
  const [customStart, setCustomStart] = useState(wall.todayLocalDate());
  const [customEnd, setCustomEnd] = useState(wall.todayLocalDate());
  const [draftStart, setDraftStart] = useState(customStart);
  const [draftEnd, setDraftEnd] = useState(customEnd);

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
      // Round-1 MED: approving from this sheet goes through PinGate, whose
      // goBack() refocuses this screen and runs reload() — the ONLY refresh
      // after an approve. Without re-reading daySessions the open sheet kept
      // the stale «Очікує перевірки» chip and the «Перевірити» button (a repeat
      // press reached timerService.verify and failed with VERIFIED_IMMUTABLE)
      // while the day cell was already green. Chosen fix: keep the sheet open
      // and refresh it, so the parent sees the approved state in place.
      if (selectedDay !== null) {
        setDaySessions(await statsService.daySessions(selectedDay));
      }
    } catch {
      // Keep the last known data on screen; the four-state rule is handled by
      // the empty markers below (data is local and synchronous in practice).
    }
  }, [statsService, wall, anchor, selectedDay]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void statsService.analyticsSessions('0000-01-01', '9999-12-31').then(setAnalyticsRows).catch(() => {});
  }, [statsService]);

  // Round-1 MED: tell the child shell whether the day sheet (and its
  // right-aligned «Перевірити») is on screen so it can hide the companion.
  useEffect(() => {
    onDayDetailChange?.(selectedDay !== null);
    return () => onDayDetailChange?.(false);
  }, [onDayDetailChange, selectedDay]);

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

  const today = wall.todayLocalDate();
  const week = statsService.getWeekRange(today);
  const analyticsStart = analyticsRange === 'thisWeek' ? week.monday : analyticsRange === 'last2Weeks' ? wall.addDays(today, -13) : customStart;
  const analyticsEnd = analyticsRange === 'thisWeek' ? today : analyticsRange === 'last2Weeks' ? today : customEnd;
  const visibleAnalyticsRows = analyticsRows.filter((row) =>
    row.localDate >= analyticsStart && row.localDate <= analyticsEnd &&
    (analyticsTasks.length === 0 || analyticsTasks.includes(row.taskTitle))
  );
  const analyticsMinutes = visibleAnalyticsRows.reduce((sum, row) => sum + row.minutes, 0);
  const taskTitles = Array.from(new Set(analyticsRows.map((row) => row.taskTitle))).sort((a, b) => a.localeCompare(b, 'uk'));
  const dateLabels = analyticsRange === 'thisWeek'
    ? week.weekDates.filter((date) => date <= today)
    : Array.from({ length: Math.min(14, Math.max(1, Math.floor((new Date(`${analyticsEnd}T00:00:00`).getTime() - new Date(`${analyticsStart}T00:00:00`).getTime()) / 86400000) + 1)) }, (_, index) => wall.addDays(analyticsStart, index));
  const chartDates = dateLabels.slice(-7);
  const chartMinutes = chartDates.map((date) => visibleAnalyticsRows.filter((row) => row.localDate === date).reduce((sum, row) => sum + row.minutes, 0));
  const chartMax = Math.max(1, ...chartMinutes);
  const rangeText = uk.calendar.analytics.rangePresets[analyticsRange];
  const filterSummary = analyticsTasks.length ? `${rangeText} · ${uk.calendar.analytics.selected}: ${analyticsTasks.join(', ')}` : rangeText;

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

      <View testID="calendar-analytics" style={styles.analytics}>
        <AppText variant="heading" style={styles.analyticsTitle}>{uk.calendar.analytics.title}</AppText>
        <View style={styles.analyticsFilterLine}>
          <AppText variant="body" numberOfLines={1} style={styles.analyticsLabel}>{filterSummary}</AppText>
          <TapTarget testID="calendar-analytics-filter-btn" accessibilityRole="button" accessibilityLabel={uk.calendar.analytics.openFilters} onPress={() => { setDraftRange(analyticsRange); setDraftTasks(analyticsTasks); setDraftStart(customStart); setDraftEnd(customEnd); setFilterOpen(true); }} style={styles.filterButton}>
            <AppText variant="heading" style={styles.filterIcon}>⏷</AppText>
          </TapTarget>
        </View>
        <AppText testID="calendar-analytics-summary" variant="caption" style={styles.rangeSummary}>
          {`${uk.calendar.analytics.grandTotal}: ${analyticsMinutes} ${uk.calendar.minutesUnit} · ${analyticsStart} — ${analyticsEnd} · ${visibleAnalyticsRows.length} ${uk.calendar.analytics.sessionsUnit}`}
        </AppText>
        <View testID="calendar-analytics-chart" style={styles.chart}>
          {chartDates.map((date, index) => (
            <View key={date} style={styles.chartColumn}>
              <View style={[styles.chartBar, { height: Math.max(3, ((chartMinutes[index] ?? 0) / chartMax) * 68) }]} />
              <AppText variant="caption" style={styles.chartLabel}>{date.slice(8)}</AppText>
            </View>
          ))}
        </View>
      </View>

      <Modal transparent visible={filterOpen} animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        {filterOpen ? <View testID="calendar-analytics-filter-dialog" style={styles.detailBackdrop}>
          <View style={styles.filterDialog}>
            <AppText variant="title" accessibilityRole="header">{uk.calendar.analytics.filterTitle}</AppText>
            <ScrollView style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
              {(['thisWeek', 'last2Weeks', 'custom'] as const).map((range) => (
                <TapTarget key={range} testID={`calendar-analytics-range-${range}`} accessibilityRole="button" accessibilityLabel={uk.calendar.analytics.rangePresets[range]} onPress={() => setDraftRange(range)} style={styles.optionRow}>
                  <AppText variant="body" style={draftRange === range ? styles.optionSelected : undefined}>{draftRange === range ? '◉' : '○'}  {uk.calendar.analytics.rangePresets[range]}</AppText>
                </TapTarget>
              ))}
              {draftRange === 'custom' ? <View style={styles.customRange}>
                <AppText variant="caption">{uk.calendar.customStart}</AppText>
                <TextInput accessibilityLabel={uk.calendar.customStart} value={draftStart} onChangeText={setDraftStart} style={styles.dateInput} />
                <AppText variant="caption">{uk.calendar.customEnd}</AppText>
                <TextInput accessibilityLabel={uk.calendar.customEnd} value={draftEnd} onChangeText={setDraftEnd} style={styles.dateInput} />
              </View> : null}
              <AppText variant="heading" style={styles.analyticsTitle}>{uk.calendar.analytics.tasks}</AppText>
              {taskTitles.map((title) => {
                const checked = draftTasks.includes(title);
                return <TapTarget key={title} testID={`calendar-analytics-task-${taskTitles.indexOf(title)}`} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ checked }} onPress={() => setDraftTasks((current) => checked ? current.filter((task) => task !== title) : [...current, title])} style={styles.optionRow}>
                  <AppText variant="body">{checked ? '☑' : '□'}  {title}</AppText>
                </TapTarget>;
              })}
              {taskTitles.length === 0 ? <AppText variant="caption">{uk.calendar.analytics.emptyTasks}</AppText> : null}
            </ScrollView>
            <View style={styles.filterActions}>
              <AppButton testID="calendar-analytics-cancel" label={uk.calendar.analytics.cancel} variant="ghost" size="sm" fullWidth={false} onPress={() => setFilterOpen(false)} />
              <AppButton testID="calendar-analytics-ok" label={uk.calendar.analytics.ok} variant="primary" size="sm" fullWidth={false} onPress={() => { setAnalyticsRange(draftRange); setAnalyticsTasks(draftTasks); setCustomStart(draftStart); setCustomEnd(draftEnd); setFilterOpen(false); }} />
            </View>
          </View>
        </View> : null}
      </Modal>

      <Modal transparent visible={selectedDay !== null} animationType="fade" onRequestClose={() => { setSelectedDay(null); setDaySessions([]); }}>
        {selectedDay !== null ? (
          <View testID="calendar-day-detail-dialog" style={styles.detailBackdrop}>
            <ScrollView testID="calendar-day-detail-scroll" style={styles.detailCard} contentContainerStyle={styles.detailContent}>
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
          </View>
        ) : null}
      </Modal>
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
  analytics: { gap: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.sm }, analyticsTitle: { color: colors.text }, analyticsLabel: { color: colors.textSecondary, flex: 1 }, rangeSummary: { color: colors.text, fontVariant: ['tabular-nums'] },
  analyticsFilterLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, filterButton: { width: MIN_TOUCH_DP, height: MIN_TOUCH_DP, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, filterIcon: { color: colors.primary, transform: [{ rotate: '180deg' }] },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 82, gap: spacing.xs }, chartColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2 }, chartBar: { width: '65%', minHeight: 3, backgroundColor: colors.primary, borderTopLeftRadius: 4, borderTopRightRadius: 4 }, chartLabel: { color: colors.textSecondary },
  customRange: { gap: spacing.xs }, dateInput: { minHeight: MIN_TOUCH_DP, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, color: colors.text, backgroundColor: colors.background },
  filterDialog: { width: '100%', maxWidth: 480, maxHeight: '85%', backgroundColor: colors.cardBg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm }, filterScroll: { flexGrow: 0, maxHeight: 440 }, filterContent: { gap: spacing.xs }, optionRow: { flexDirection: 'row', justifyContent: 'flex-start', minHeight: MIN_TOUCH_DP, paddingHorizontal: spacing.xs }, optionSelected: { color: colors.primary, fontWeight: '700' }, filterActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xs },
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
  detailBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  detailCard: {
    flex: 1, width: '100%', maxWidth: 560, // Large dialog — no height cap (the old sheet was maxHeight: 280)
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadows.overlay,
    overflow: 'hidden',
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
