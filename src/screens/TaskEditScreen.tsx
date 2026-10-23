import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { tasksStore } from '../state/tasksStore';
import { parentSessionStore } from '../state/parentSessionStore';
import { validateTask, TaskValidationError } from '../domain/tasks/validation';
import { AppText } from '../ui/components/AppText';
import { TapTarget } from '../ui/components/TapTarget';
import { ParentGuard } from '../navigation/ParentGuard';
import { uk } from '../i18n/uk';
import { colors, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TaskEdit'>;

const WEEKDAYS = uk.taskCrud.weekdays.map((label, bit) => ({ label, bit }));

export function TaskEditScreen({ route, navigation }: Props) {
  const { tasksRepo, sessionsRepo, wall, db } = useServices();
  const taskId = route.params?.taskId;
  const isEditing = taskId !== undefined;

  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('');
  const [targetMinutes, setTargetMinutes] = useState(15);
  const [daysMask, setDaysMask] = useState(127); // all 7 days by default
  const [hasSessions, setHasSessions] = useState(false);
  const [errors, setErrors] = useState<TaskValidationError[]>([]);

  useEffect(() => {
    if (isEditing && taskId) {
      void (async () => {
        const task = await tasksRepo.get(taskId);
        if (task) {
          setTitle(task.title);
          setEmoji(task.emoji ?? '');
          setTargetMinutes(task.targetMinutes);
          setDaysMask(task.daysMask);
        }

        const countRow = await db.get<{ count: number }>(
          `SELECT COUNT(*) AS count FROM sessions WHERE task_id = ?;`,
          [taskId]
        );
        setHasSessions((countRow?.count ?? 0) > 0);
      })();
    }
  }, [isEditing, taskId, tasksRepo, db]);

  const toggleDay = (bit: number) => {
    parentSessionStore.touch();
    const mask = 1 << bit;
    setDaysMask((prev) => prev ^ mask);
  };

  const handleAdjustMinutes = (delta: number) => {
    parentSessionStore.touch();
    setTargetMinutes((prev) => Math.max(0, Math.min(130, prev + delta)));
  };

  const handleSave = async () => {
    parentSessionStore.touch();
    const result = validateTask({
      title,
      emoji: emoji.trim() ? emoji.trim() : null,
      targetMinutes,
      daysMask,
    });

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors([]);
    const nowIso = wall.nowIso();

    if (isEditing && taskId) {
      await tasksRepo.update(
        taskId,
        {
          title: result.value.title,
          emoji: result.value.emoji,
          targetMinutes: result.value.targetMinutes,
          daysMask: result.value.daysMask,
        },
        nowIso
      );
    } else {
      await tasksRepo.create(result.value, nowIso);
    }

    await tasksStore.refreshToday();
    navigation.goBack();
  };

  const handleArchive = async () => {
    if (!taskId) return;
    parentSessionStore.touch();
    await tasksRepo.archive(taskId, wall.nowIso());
    await tasksStore.refreshToday();
    navigation.goBack();
  };

  const handleDelete = async () => {
    if (!taskId) return;
    parentSessionStore.touch();
    await tasksRepo.deleteIfUnused(taskId);
    await tasksStore.refreshToday();
    navigation.goBack();
  };

  const getErrorMessage = (err: TaskValidationError): string => {
    switch (err) {
      case 'TITLE_EMPTY':
        return uk.taskCrud.errors.titleEmpty;
      case 'TITLE_TOO_LONG':
        return uk.taskCrud.errors.titleTooLong;
      case 'TARGET_RANGE':
        return uk.taskCrud.errors.targetRange;
      case 'DAYS_EMPTY':
        return uk.taskCrud.errors.daysEmpty;
    }
  };

  return (
    <ParentGuard navigation={navigation}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Top bar */}
        <View testID="taskedit-topbar" style={styles.topBar}>
          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.taskCrud.cancel}
            onPress={() => {
              parentSessionStore.touch();
              navigation.goBack();
            }}
            style={styles.cancelNavButton}
          >
            <AppText variant="body" style={styles.cancelNavText}>
              {uk.taskCrud.cancel}
            </AppText>
          </TapTarget>

          <AppText
            variant="title"
            accessibilityRole="header"
            numberOfLines={1}
            style={styles.screenTitle}
          >
            {isEditing ? uk.taskCrud.editTask : uk.taskCrud.createTask}
          </AppText>

          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.taskCrud.save}
            onPress={handleSave}
            style={styles.saveNavButton}
          >
            <AppText variant="body" style={styles.saveNavText}>
              {uk.taskCrud.save}
            </AppText>
          </TapTarget>
        </View>

        {/* Validation Errors */}
        {errors.length > 0 ? (
          <View style={styles.errorBox}>
            {errors.map((err) => (
              <AppText key={err} variant="body" style={styles.errorText}>
                {getErrorMessage(err)}
              </AppText>
            ))}
          </View>
        ) : null}

        {/* Title Input */}
        <View style={styles.field}>
          <AppText variant="body" style={styles.fieldLabel}>
            {uk.taskCrud.titleLabel}
          </AppText>
          <TextInput
            testID="task-title-input"
            value={title}
            onChangeText={(t) => {
              parentSessionStore.touch();
              setTitle(t);
            }}
            placeholder={uk.taskCrud.errors.titleEmpty}
            placeholderTextColor={colors.textSecondary}
            style={styles.textInput}
          />
        </View>

        {/* Emoji Input */}
        <View style={styles.field}>
          <AppText variant="body" style={styles.fieldLabel}>
            {uk.taskCrud.emojiLabel}
          </AppText>
          <TextInput
            testID="task-emoji-input"
            value={emoji}
            onChangeText={(e) => {
              parentSessionStore.touch();
              setEmoji(e);
            }}
            placeholder="📚"
            placeholderTextColor={colors.textSecondary}
            style={styles.textInput}
            maxLength={8}
          />
        </View>

        {/* Target Minutes Stepper */}
        <View style={styles.field}>
          <AppText variant="body" style={styles.fieldLabel}>
            {uk.taskCrud.targetMinutesLabel}
          </AppText>
          <View testID="taskedit-stepper" style={styles.stepperRow}>
            <TapTarget
              accessibilityRole="button"
              accessibilityLabel={uk.taskCrud.stepLess5}
              onPress={() => handleAdjustMinutes(-5)}
              style={styles.stepperButton}
            >
              <AppText variant="title" style={styles.stepperButtonText}>
                -5
              </AppText>
            </TapTarget>

            <TapTarget
              accessibilityRole="button"
              accessibilityLabel={uk.taskCrud.stepLess1}
              onPress={() => handleAdjustMinutes(-1)}
              style={styles.stepperButton}
            >
              <AppText variant="title" style={styles.stepperButtonText}>
                -1
              </AppText>
            </TapTarget>

            <AppText variant="title" style={styles.minutesDisplay}>
              {`${targetMinutes} хв`}
            </AppText>

            <TapTarget
              accessibilityRole="button"
              accessibilityLabel={uk.taskCrud.stepMore1}
              onPress={() => handleAdjustMinutes(1)}
              style={styles.stepperButton}
            >
              <AppText variant="title" style={styles.stepperButtonText}>
                +1
              </AppText>
            </TapTarget>

            <TapTarget
              accessibilityRole="button"
              accessibilityLabel={uk.taskCrud.stepMore5}
              onPress={() => handleAdjustMinutes(5)}
              style={styles.stepperButton}
            >
              <AppText variant="title" style={styles.stepperButtonText}>
                +5
              </AppText>
            </TapTarget>
          </View>
        </View>

        {/* Weekday Toggles */}
        <View style={styles.field}>
          <AppText variant="body" style={styles.fieldLabel}>
            {uk.taskCrud.weekdaysLabel}
          </AppText>
          <View testID="taskedit-weekdays" style={styles.weekdaysRow}>
            {WEEKDAYS.map((day) => {
              const isSelected = (daysMask & (1 << day.bit)) !== 0;
              return (
                <TapTarget
                  key={day.bit}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.label}: ${isSelected ? uk.taskCrud.daySelected : uk.taskCrud.dayUnselected}`}
                  onPress={() => toggleDay(day.bit)}
                  style={[
                    styles.dayButton,
                    isSelected ? styles.dayButtonSelected : styles.dayButtonUnselected,
                  ]}
                >
                  <AppText
                    variant="body"
                    style={[
                      styles.dayText,
                      isSelected ? styles.dayTextSelected : styles.dayTextUnselected,
                    ]}
                  >
                    {day.label}
                  </AppText>
                </TapTarget>
              );
            })}
          </View>
        </View>

        {/* Action: Archive or Delete */}
        {isEditing ? (
          <View style={styles.dangerZone}>
            {hasSessions ? (
              <TapTarget
                accessibilityRole="button"
                accessibilityLabel={uk.taskCrud.archive}
                onPress={handleArchive}
                style={styles.archiveButton}
              >
                <AppText variant="body" style={styles.archiveButtonText}>
                  {uk.taskCrud.archive}
                </AppText>
              </TapTarget>
            ) : (
              <TapTarget
                accessibilityRole="button"
                accessibilityLabel={uk.taskCrud.delete}
                onPress={handleDelete}
                style={styles.deleteButton}
              >
                <AppText variant="body" style={styles.deleteButtonText}>
                  {uk.taskCrud.delete}
                </AppText>
              </TapTarget>
            )}
          </View>
        ) : null}
      </ScrollView>
    </ParentGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    backgroundColor: colors.background,
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: spacing.sm,
    columnGap: spacing.sm,
    width: '100%',
  },
  cancelNavButton: {
    padding: spacing.sm,
  },
  cancelNavText: {
    color: colors.textSecondary,
  },
  screenTitle: {
    color: colors.text,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  saveNavButton: {
    flexBasis: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  saveNavText: {
    color: colors.white,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: spacing.md,
    borderRadius: 8,
    gap: spacing.xs,
  },
  errorText: {
    color: colors.abandoned,
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textSecondary,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    color: colors.text,
    minHeight: 48,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    gap: spacing.sm,
  },
  stepperButton: {
    minWidth: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  stepperButtonText: {
    color: colors.primary,
  },
  minutesDisplay: {
    color: colors.text,
    minWidth: 80,
    textAlign: 'center',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    gap: spacing.xs,
  },
  dayButton: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayButtonSelected: {
    backgroundColor: colors.primary,
  },
  dayButtonUnselected: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayText: {
    textAlign: 'center',
  },
  dayTextSelected: {
    color: colors.white,
  },
  dayTextUnselected: {
    color: colors.text,
  },
  dangerZone: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  archiveButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.awaiting,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
  },
  archiveButtonText: {
    color: colors.awaiting,
  },
  deleteButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.abandoned,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: colors.abandoned,
  },
});
