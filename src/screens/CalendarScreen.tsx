import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { DaySessionStat, DayStat, RangePreset } from '../services/stats/statsService';
import { CategoryRangeTotals, TASK_CATEGORIES, TaskCategory } from '../domain/stats/categoryTotals';
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
  const [rangePreset,setRangePreset]=useState<RangePreset>('last-2-weeks'); const [categoryFilter,setCategoryFilter]=useState<TaskCategory|'all'>('all');
  const [customStart,setCustomStart]=useState(wall.todayLocalDate()); const [customEnd,setCustomEnd]=useState(wall.todayLocalDate()); const [categoryTotals,setCategoryTotals]=useState<CategoryRangeTotals|null>(null);
  const customRange=customStart<=customEnd?{start:customStart,end:customEnd}:{start:customEnd,end:customStart};
  useEffect(()=>{let active=true; const range=statsService.resolveRange(rangePreset,rangePreset==='custom'?customRange:undefined); void statsService.categoryTotals({startDate:range.start,endDate:range.end,category:categoryFilter}).then(result=>{if(active)setCategoryTotals(result);}).catch(()=>{if(active)setCategoryTotals(null);}); return ()=>{active=false;};},[statsService,rangePreset,customStart,customEnd,categoryFilter]);

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

      <View testID="calendar-analytics" style={styles.analytics}><AppText variant="title" style={styles.analyticsTitle}>{uk.calendar.analytics.title}</AppText><AppText variant="caption" style={styles.analyticsLabel}>{uk.calendar.analytics.ranges}</AppText>
        <View testID="calendar-range-presets" style={styles.chipRow}>{(['this-week','last-2-weeks','custom'] as const).map(preset=>{const selected=rangePreset===preset;const label=preset==='this-week'?uk.calendar.analytics.rangePresets.thisWeek:preset==='last-2-weeks'?uk.calendar.analytics.rangePresets.last2Weeks:uk.calendar.analytics.rangePresets.custom;return <TapTarget key={preset} testID={`calendar-range-${preset}`} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected}} onPress={()=>setRangePreset(preset)} style={[styles.chip,selected&&styles.chipSelected]}><AppText variant="caption" style={selected?styles.chipTextSelected:styles.chipText}>{label}</AppText></TapTarget>;})}</View>
        {rangePreset==='custom'?<View testID="calendar-custom-range" style={styles.customRange}>{(['start','end'] as const).map(kind=><View key={kind} style={styles.customDateRow}><AppText variant="caption" style={styles.analyticsLabel}>{kind==='start'?uk.calendar.analytics.pickStart:uk.calendar.analytics.pickEnd}</AppText><View style={styles.dateChips}>{Array.from({length:14},(_,i)=>wall.addDays(wall.todayLocalDate(),i-13)).slice(kind==='start'?0:7,kind==='start'?7:14).map(date=>{const selected=(kind==='start'?customStart:customEnd)===date;return <TapTarget key={`${kind}-${date}`} accessibilityRole="button" accessibilityLabel={`${kind==='start'?uk.calendar.analytics.pickStart:uk.calendar.analytics.pickEnd}: ${date}`} accessibilityState={{selected}} onPress={()=>{if(kind==='start'){setCustomStart(date);if(date>customEnd)setCustomEnd(date);}else{setCustomEnd(date);if(date<customStart)setCustomStart(date);}}} style={[styles.dateChip,selected&&styles.chipSelected]}><AppText variant="caption" style={selected?styles.chipTextSelected:styles.chipText}>{date.slice(5)}</AppText></TapTarget>;})}</View></View>)}<AppText variant="caption">{`${customRange.start} — ${customRange.end}`}</AppText></View>:null}
        <AppText variant="caption" style={styles.analyticsLabel}>{uk.calendar.analytics.categories}</AppText><View testID="calendar-category-filter" style={styles.chipRow}>{(['all',...TASK_CATEGORIES] as const).map(category=>{const selected=categoryFilter===category;const label=uk.calendar.analytics.categoryLabels[category];return <TapTarget key={category} testID={`calendar-category-${category}`} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected}} onPress={()=>setCategoryFilter(category)} style={[styles.chip,selected&&styles.chipSelected]}><AppText variant="caption" style={selected?styles.chipTextSelected:styles.chipText}>{label}</AppText></TapTarget>;})}</View>
        <View testID="calendar-category-totals" style={styles.totalCards}>{(categoryTotals?.totals??(categoryFilter==='all'?TASK_CATEGORIES:[categoryFilter]).map(category=>({category,minutes:0,sessionCount:0}))).map(total=><View key={total.category} testID={`calendar-total-${total.category}`} style={[styles.totalCard,total.minutes===0&&styles.cardEmpty]}><AppText variant="body">{`${categoryIcon(total.category)} ${uk.calendar.analytics.categoryLabels[total.category]}`}</AppText><AppText variant="heading">{`${total.minutes} ${uk.calendar.minutesUnit}`}</AppText><AppText variant="caption">{`${total.sessionCount} ${uk.calendar.analytics.sessionsUnit}`}</AppText></View>)}</View>
        <AppText testID="calendar-range-summary" variant="caption" style={styles.rangeSummary}>{`${uk.calendar.analytics.grandTotal}: ${categoryTotals?.grandTotalMinutes??0} ${uk.calendar.minutesUnit} · ${categoryTotals?.start??customRange.start} — ${categoryTotals?.end??customRange.end}`}</AppText></View>

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
function categoryIcon(category: TaskCategory): string { return category==='homework'?'📝':category==='reading'?'📚':category==='sport'?'⚽':'✨'; }

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
  analytics: { gap: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.sm }, analyticsTitle: { color: colors.text }, analyticsLabel: { color: colors.textSecondary }, chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, chip: { minHeight: MIN_TOUCH_DP, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.text }, chipTextSelected: { color: colors.textOnAccent }, customRange: { gap: spacing.xs }, customDateRow: { gap: spacing.xs }, dateChips: { flexDirection: 'row', gap: spacing.xs }, dateChip: { flex: 1, minWidth: 0, minHeight: MIN_TOUCH_DP, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, totalCards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, totalCard: { flexGrow: 1, flexBasis: '47%', minHeight: MIN_TOUCH_DP, padding: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 2 }, cardEmpty: { opacity: 0.45 }, rangeSummary: { color: colors.text, fontVariant: ['tabular-nums'] },
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
