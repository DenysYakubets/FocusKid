import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useTasksStore } from '../state/tasksStore';
import { useTimerStore } from '../state/timerStore';
import { useServices } from '../state/appServices';
import { TaskCard } from '../ui/components/TaskCard';
import { AppText } from '../ui/components/AppText';
import { TapTarget } from '../ui/components/TapTarget';
import { uk } from '../i18n/uk';
import { colors, spacing, statusColors } from '../ui/theme';
import { TodayTaskView } from '../domain/tasks/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Today'>;

export function TodayScreen({ navigation }: Props) {
  const services = useServices();
  const todayTasks = useTasksStore((s) => s.todayTasks);
  const refreshToday = useTasksStore((s) => s.refreshToday);
  const timerSnapshot = useTimerStore((s) => s.snapshot);
  const startTimer = useTimerStore((s) => s.start);
  const lastError = useTimerStore((s) => s.lastError);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    if (task.status === 'idle') {
      const ok = await startTimer(task.id);
      if (ok) {
        await refreshToday(services);
        navigation.navigate('Timer', { taskId: task.id });
      } else {
        const error = useTimerStore.getState().lastError;
        if (error === 'ACTIVE_SESSION_EXISTS') {
          setErrorMessage(uk.today.activeSessionError);
        } else {
          setErrorMessage(error ?? 'Error');
        }
      }
    } else {
      navigation.navigate('Timer', { taskId: task.id });
    }
  };

  const handleParentPress = () => {
    navigation.navigate('PinGate', { intent: 'enterParent' });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <AppText variant="title" style={styles.titleText}>
            {uk.today.title}
          </AppText>
          {activeTask ? (
            <View style={styles.activeBadge}>
              <AppText variant="body" style={styles.activeBadgeText}>
                {`⏱ ${uk.today.active}`}
              </AppText>
            </View>
          ) : null}
        </View>

        <TapTarget
          accessibilityRole="button"
          accessibilityLabel={uk.today.parentButton}
          onPress={handleParentPress}
          style={styles.parentButton}
        >
          <AppText variant="body" style={styles.parentButtonText}>
            {`🔒 ${uk.today.parentButton}`}
          </AppText>
        </TapTarget>
      </View>

      {errorMessage ? (
        <View style={styles.errorContainer}>
          <AppText variant="body" style={styles.errorText}>
            {errorMessage}
          </AppText>
        </View>
      ) : null}

      <FlatList
        data={todayTasks}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TaskCard task={item} onPress={() => void handleTaskPress(item)} />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <AppText variant="body" style={styles.emptyText}>
              {uk.today.empty}
            </AppText>
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
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  titleArea: {
    flex: 1,
  },
  titleText: {
    color: colors.text,
  },
  activeBadge: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: statusColors.active.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 9999,
  },
  activeBadgeText: {
    color: statusColors.active.text,
    fontWeight: '600',
  },
  parentButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: spacing.sm,
  },
  parentButtonText: {
    color: colors.textSecondary,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.md,
  },
  errorText: {
    color: '#991B1B',
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
  },
});
