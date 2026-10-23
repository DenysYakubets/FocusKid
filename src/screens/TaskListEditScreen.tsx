import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { parentSessionStore } from '../state/parentSessionStore';
import { Task } from '../domain/tasks/types';
import { AppText } from '../ui/components/AppText';
import { TapTarget } from '../ui/components/TapTarget';
import { ParentGuard } from '../navigation/ParentGuard';
import { uk } from '../i18n/uk';
import { colors, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TaskListEdit'>;

export function TaskListEditScreen({ navigation }: Props) {
  const { tasksRepo } = useServices();
  const [tasks, setTasks] = useState<Task[]>([]);

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
      <View style={styles.container}>
        {/* Top bar */}
        <View testID="tasklistedit-topbar" style={styles.topBar}>
          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.timer.back}
            onPress={() => {
              parentSessionStore.touch();
              navigation.goBack();
            }}
            style={styles.backButton}
          >
            <AppText variant="body" style={styles.backButtonText}>
              {`← ${uk.timer.back}`}
            </AppText>
          </TapTarget>

          <AppText
            testID="tasklistedit-title"
            variant="title"
            accessibilityRole="header"
            numberOfLines={1}
            style={styles.title}
          >
            {uk.taskCrud.listTitle}
          </AppText>

          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.taskCrud.addTask}
            onPress={handleCreate}
            style={styles.addButton}
          >
            <AppText variant="body" style={styles.addButtonText}>
              {`+ ${uk.taskCrud.addTask}`}
            </AppText>
          </TapTarget>
        </View>

        {/* Task list */}
        <FlatList
          data={tasks}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          onScroll={() => parentSessionStore.touch()}
          scrollEventThrottle={1000}
          renderItem={({ item, index }) => (
            <View style={styles.taskCard}>
              <View style={styles.taskInfo}>
                <AppText variant="title" style={styles.taskTitle}>
                  {item.emoji ? `${item.emoji} ${item.title}` : item.title}
                </AppText>
                <AppText variant="body" style={styles.taskMinutes}>
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

                <TapTarget
                  accessibilityRole="button"
                  accessibilityLabel={`${uk.taskCrud.editTask}: ${item.title}`}
                  onPress={() => handleEdit(item.id)}
                  style={styles.editButton}
                >
                  <AppText variant="body" style={styles.editButtonText}>
                    {uk.taskCrud.editTask}
                  </AppText>
                </TapTarget>
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
    padding: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: spacing.sm,
    columnGap: spacing.sm,
    width: '100%',
    marginBottom: spacing.lg,
  },
  backButton: {
    padding: spacing.sm,
  },
  backButtonText: {
    color: colors.primary,
  },
  title: {
    color: colors.text,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  addButton: {
    flexBasis: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  addButtonText: {
    color: colors.white,
  },
  listContent: {
    gap: spacing.md,
  },
  taskCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  taskInfo: {
    gap: spacing.xs,
  },
  taskTitle: {
    color: colors.text,
  },
  taskMinutes: {
    color: colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reorderButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reorderButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  reorderButtonText: {
    color: colors.text,
  },
  editButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
  },
  editButtonText: {
    color: colors.primary,
  },
});
