import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useTasksStore } from '../state/tasksStore';
import { useTimerStore } from '../state/timerStore';
import { useServices } from '../state/appServices';
import { TaskCard } from '../ui/components/TaskCard';
import { AppButton } from '../ui/components/AppButton';
import { AppText } from '../ui/components/AppText';
import { NoticeBox } from '../ui/components/NoticeBox';
import { StatusChip } from '../ui/components/StatusChip';
import { CONTENT_MAX_WIDTH, useScreenGutter } from '../ui/hooks/useScreenGutter';
import { uk } from '../i18n/uk';
import { colors, spacing } from '../ui/theme';
import { TodayTaskView } from '../domain/tasks/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Today'>;

export function TodayScreen({ navigation }: Props) {
  const services = useServices();
  const { gutter, isLandscape } = useScreenGutter();

  const todayTasks = useTasksStore((s) => s.todayTasks);
  const refreshToday = useTasksStore((s) => s.refreshToday);
  const timerSnapshot = useTimerStore((s) => s.snapshot);
  const startTimer = useTimerStore((s) => s.start);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startPending, setStartPending] = useState(false);

  useEffect(() => {
    void refreshToday(services);
    const unsub = navigation?.addListener?.('focus', () => {
      void refreshToday(services);
    });
    return () => {
      unsub?.();
    };
  }, [navigation, refreshToday, services]);

  const activeTask =
    timerSnapshot.state.kind === 'Running' || timerSnapshot.state.kind === 'Paused';

  const handleTaskPress = async (task: TodayTaskView) => {
    setErrorMessage(null);

    // C3: explicit start — do NOT auto-start. Open the Timer screen in its
    // IDLE/READY state; the child presses «Почати» there to begin the countdown.
    navigation.navigate('Timer', { taskId: task.id });
  };

  const handleParentPress = () => {
    navigation.navigate('PinGate', { intent: 'enterParent' });
  };

  return (
    <View
      testID={isLandscape ? 'today-layout-landscape' : 'today-layout-portrait'}
      style={[styles.container, { paddingHorizontal: gutter }]}
    >
      {/* Header is exactly <= 2 lines: Row 1 = title + parent chip,
          Row 2 = active StatusChip (forced onto its own line). */}
      <View testID="today-header" style={styles.header}>
        <AppText
          variant="title"
          accessibilityRole="header"
          numberOfLines={1}
          style={styles.titleText}
        >
          {uk.today.title}
        </AppText>

        <AppButton
          label={uk.today.parentButton}
          variant="secondary"
          size="sm"
          onPress={handleParentPress}
        />

        {activeTask ? (
          <View style={styles.badgeRow}>
            <StatusChip status="active" />
          </View>
        ) : null}
      </View>

      {errorMessage ? <NoticeBox tone="error" message={errorMessage} /> : null}

      <FlatList
        style={[styles.list, isLandscape && styles.listLandscape]}
        data={todayTasks}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onPress={() => void handleTaskPress(item)}
            disabled={startPending}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <AppText variant="body" style={styles.emptyText}>
              {uk.today.empty}
            </AppText>
            <AppText variant="body" style={styles.emptyHintText}>
              {uk.today.emptyHint}
            </AppText>
            <AppButton
              label={uk.today.emptyCta}
              variant="secondary"
              size="md"
              onPress={() => navigation.navigate('PinGate', { intent: 'enterParent' })}
            />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    rowGap: spacing.sm,
    columnGap: spacing.sm,
    marginBottom: spacing.lg,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    color: colors.text,
  },
  badgeRow: {
    flexBasis: '100%',
    alignItems: 'flex-start',
  },
  list: {
    flex: 1,
    width: '100%',
  },
  listLandscape: {
    maxWidth: CONTENT_MAX_WIDTH.list,
    alignSelf: 'center',
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    paddingTop: spacing.xxl,
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyHintText: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
