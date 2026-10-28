import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { parentSessionStore } from '../state/parentSessionStore';
import { Task } from '../domain/tasks/types';
import { UpdateChecker } from '../ui/components/UpdateChecker';
import { useUpdateRecheck } from '../ui/hooks/useUpdateRecheck';
import { AppButton } from '../ui/components/AppButton';
import { AppText } from '../ui/components/AppText';
import { AppToolbar } from '../ui/components/AppToolbar';
import { TapTarget } from '../ui/components/TapTarget';
import { ParentGuard } from '../navigation/ParentGuard';
import { CONTENT_MAX_WIDTH, useScreenGutter } from '../ui/hooks/useScreenGutter';
import { uk } from '../i18n/uk';
import { colors, radius, shadows, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TaskListEdit'>;

export function TaskListEditScreen({ navigation }: Props) {
  const { tasksRepo } = useServices();
  const { gutter, isLandscape } = useScreenGutter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const updateRecheckKey = useUpdateRecheck();

  const loadTasks = async () => {
    const all = await tasksRepo.listAll();
    setTasks(all.filter((t) => !t.archived));
  };

  useEffect(() => {
    void loadTasks();
    const unsub = navigation.addListener('focus', () => {
      void loadTasks();
    });
    return unsub;
  }, [navigation, tasksRepo]);

  const handleMove = async (taskId: number, direction: 'up' | 'down') => {
    parentSessionStore.touch();
    await tasksRepo.move(taskId, direction);
    await loadTasks();
  };

  const handleEdit = (taskId: number) => {
    parentSessionStore.touch();
    navigation.navigate('TaskEdit', { taskId });
  };

  const handleCreate = () => {
    parentSessionStore.touch();
    navigation.navigate('TaskEdit', {});
  };

  return (
    <ParentGuard navigation={navigation}>
      <View style={[styles.container, { padding: gutter }]}>
        {/* Row B = full-width primary "add" action (pinned by layoutResponsive). */}
        <AppToolbar
          testID="tasklistedit-topbar"
          onBack={() => {
            parentSessionStore.touch();
            navigation.goBack();
          }}
          backLabel={uk.timer.back}
          title={uk.taskCrud.listTitle}
          titleTestID="tasklistedit-title"
          actions={
            <AppButton
              label={uk.taskCrud.addTask}
              variant="primary"
              size="md"
              onPress={handleCreate}
            />
          }
        />

        <UpdateChecker recheckKey={updateRecheckKey} />

        {/* Task list — the list is the scroll container (no outer ScrollView) */}
        <FlatList
          style={[styles.list, isLandscape && styles.listLandscape]}
          data={tasks}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          onScroll={() => parentSessionStore.touch()}
          scrollEventThrottle={1000}
          renderItem={({ item, index }) => (
            <View style={styles.taskCard}>
              <View style={styles.taskInfo}>
                <AppText variant="title" numberOfLines={2} style={styles.taskTitle}>
                  {item.emoji ? `${item.emoji} ${item.title}` : item.title}
                </AppText>
                <AppText variant="caption" style={styles.taskMinutes}>
                  {`${item.targetMinutes} хв`}
                </AppText>
              </View>

              <View style={styles.actionsRow}>
                <View style={styles.reorderButtons}>
                  <TapTarget
                    accessibilityRole="button"
                    accessibilityLabel={`${uk.taskCrud.moveUp}: ${item.title}`}
                    disabled={index === 0}
                    onPress={() => handleMove(item.id, 'up')}
                    style={[styles.reorderButton, index === 0 && styles.buttonDisabled]}
                  >
                    <AppText variant="body" style={styles.reorderButtonText}>
                      ▲
                    </AppText>
                  </TapTarget>

                  <TapTarget
                    accessibilityRole="button"
                    accessibilityLabel={`${uk.taskCrud.moveDown}: ${item.title}`}
                    disabled={index === tasks.length - 1}
                    onPress={() => handleMove(item.id, 'down')}
                    style={[
                      styles.reorderButton,
                      index === tasks.length - 1 && styles.buttonDisabled,
                    ]}
                  >
                    <AppText variant="body" style={styles.reorderButtonText}>
                      ▼
                    </AppText>
                  </TapTarget>
                </View>

                <AppButton
                  label={uk.taskCrud.editTask}
                  a11yLabel={`${uk.taskCrud.editTask}: ${item.title}`}
                  variant="ghost"
                  size="sm"
                  onPress={() => handleEdit(item.id)}
                />
              </View>
            </View>
          )}
        />
      </View>
    </ParentGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    gap: spacing.lg,
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
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  taskCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadows.card,
    padding: spacing.md,
    gap: spacing.md,
  },
  taskInfo: {
    gap: spacing.xs,
  },
  taskTitle: {
    color: colors.text,
    flexShrink: 1,
  },
  taskMinutes: {
    color: colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    rowGap: spacing.sm,
    columnGap: spacing.sm,
  },
  reorderButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reorderButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  reorderButtonText: {
    color: colors.text,
  },
});
