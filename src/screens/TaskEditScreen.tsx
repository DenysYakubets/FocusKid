import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { tasksStore } from '../state/tasksStore';
import { parentSessionStore } from '../state/parentSessionStore';
import { validateTask, TaskValidationError } from '../domain/tasks/validation';
import { AppButton } from '../ui/components/AppButton';
import { AppText } from '../ui/components/AppText';
import { EmojiPicker } from '../ui/components/EmojiPicker';
import { NoticeBox } from '../ui/components/NoticeBox';
import { AppToolbar } from '../ui/components/AppToolbar';
import { TapTarget } from '../ui/components/TapTarget';
import { ParentGuard } from '../navigation/ParentGuard';
import { CONTENT_MAX_WIDTH, useScreenGutter } from '../ui/hooks/useScreenGutter';
import { uk } from '../i18n/uk';
import { colors, radius, spacing, typography } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TaskEdit'>;

const WEEKDAYS = uk.taskCrud.weekdays.map((label, bit) => ({ label, bit }));

export function TaskEditScreen({ route, navigation }: Props) {
  const services = useServices();
  const { tasksRepo, sessionsRepo, wall, db } = services;
  const { gutter } = useScreenGutter();
  const taskId = route.params?.taskId;
  const isEditing = taskId !== undefined;

  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('');
  const [targetMinutes, setTargetMinutes] = useState(15);
  const [daysMask, setDaysMask] = useState(127); // all 7 days by default
  // C4: times per day (1..10, default 1)
  const [targetPerDay, setTargetPerDay] = useState(1);
  const [hasSessions, setHasSessions] = useState(false);
  const [errors, setErrors] = useState<TaskValidationError[]>([]);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  useEffect(() => {
    if (isEditing && taskId) {
      void (async () => {
        const task = await tasksRepo.get(taskId);
        if (task) {
          setTitle(task.title);
          setEmoji(task.emoji ?? '');
          setTargetMinutes(task.targetMinutes);
          setDaysMask(task.daysMask);
          setTargetPerDay(task.targetPerDay ?? 1);
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

  const handleAdjustPerDay = (delta: number) => {
    parentSessionStore.touch();
    setTargetPerDay((prev) => Math.max(1, Math.min(10, prev + delta)));
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
          targetPerDay,
        },
        nowIso
      );
    } else {
      await tasksRepo.create({ ...result.value, targetPerDay }, nowIso);
    }

    await tasksStore.refreshToday(services);
    navigation.goBack();
  };

  const handleArchive = async () => {
    if (!taskId) return;
    parentSessionStore.touch();
    await tasksRepo.archive(taskId, wall.nowIso());
    await tasksStore.refreshToday(services);
    navigation.goBack();
  };

  const handleDelete = async () => {
    if (!taskId) return;
    parentSessionStore.touch();
    await tasksRepo.deleteIfUnused(taskId);
    await tasksStore.refreshToday(services);
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
      <View style={styles.shell}>
        <ScrollView
          contentContainerStyle={[styles.container, { padding: gutter }]}
          keyboardShouldPersistTaps="handled"
          onScroll={() => parentSessionStore.touch()}
          scrollEventThrottle={1000}
        >
          {/* Row A only — the primary action lives in the bottom footer (F4). */}
          <AppToolbar
            testID="taskedit-topbar"
            onBack={() => {
              parentSessionStore.touch();
              navigation.goBack();
            }}
            backLabel={uk.taskCrud.cancel}
            title={isEditing ? uk.taskCrud.editTask : uk.taskCrud.createTask}
          />

          {/* Validation errors */}
          {errors.map((err) => (
            <NoticeBox key={err} tone="error" message={getErrorMessage(err)} />
          ))}

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

          {/* F5: emoji picker trigger (no free keyboard entry) */}
          <View style={styles.field}>
            <AppText variant="body" style={styles.fieldLabel}>
              {uk.taskCrud.emojiLabel}
            </AppText>
            <TapTarget
              testID="task-emoji-field"
              accessibilityRole="button"
              accessibilityLabel={
                emoji
                  ? `${uk.taskCrud.emojiLabel}: ${emoji}`
                  : `${uk.taskCrud.emojiLabel}: ${uk.taskCrud.emojiPlaceholder}`
              }
              onPress={() => {
                parentSessionStore.touch();
                setEmojiPickerOpen(true);
              }}
              style={styles.emojiField}
            >
              <AppText variant="title" style={styles.emojiFieldValue}>
                {emoji ? emoji : uk.taskCrud.emojiPlaceholder}
              </AppText>
              <AppText variant="body" style={styles.emojiFieldHint}>
                {`› ${uk.taskCrud.emojiTitle}`}
              </AppText>
            </TapTarget>
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
                <AppText variant="body" style={styles.stepperButtonText}>
                  -5
                </AppText>
              </TapTarget>

              <TapTarget
                accessibilityRole="button"
                accessibilityLabel={uk.taskCrud.stepLess1}
                onPress={() => handleAdjustMinutes(-1)}
                style={styles.stepperButton}
              >
                <AppText variant="body" style={styles.stepperButtonText}>
                  -1
                </AppText>
              </TapTarget>

              <AppText variant="heading" style={styles.minutesDisplay}>
                {`${targetMinutes} хв`}
              </AppText>

              <TapTarget
                accessibilityRole="button"
                accessibilityLabel={uk.taskCrud.stepMore1}
                onPress={() => handleAdjustMinutes(1)}
                style={styles.stepperButton}
              >
                <AppText variant="body" style={styles.stepperButtonText}>
                  +1
                </AppText>
              </TapTarget>

              <TapTarget
                accessibilityRole="button"
                accessibilityLabel={uk.taskCrud.stepMore5}
                onPress={() => handleAdjustMinutes(5)}
                style={styles.stepperButton}
              >
                <AppText variant="body" style={styles.stepperButtonText}>
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

          {/* C4: times per day stepper (1..10) */}
          <View style={styles.field}>
            <AppText variant="body" style={styles.fieldLabel}>
              {uk.taskCrud.timesPerDayLabel}
            </AppText>
            <View testID="taskedit-timesperday" style={styles.stepperRow}>
              <TapTarget
                accessibilityRole="button"
                accessibilityLabel={uk.taskCrud.timesPerDayMinus}
                onPress={() => handleAdjustPerDay(-1)}
                style={styles.stepperButton}
              >
                <AppText variant="body" style={styles.stepperButtonText}>
                  −1
                </AppText>
              </TapTarget>

              <AppText variant="heading" style={styles.minutesDisplay}>
                {`${targetPerDay} ${uk.taskCrud.timesPerDayUnit}`}
              </AppText>

              <TapTarget
                accessibilityRole="button"
                accessibilityLabel={uk.taskCrud.timesPerDayPlus}
                onPress={() => handleAdjustPerDay(1)}
                style={styles.stepperButton}
              >
                <AppText variant="body" style={styles.stepperButtonText}>
                  +1
                </AppText>
              </TapTarget>
            </View>
          </View>

          {/* Action: Archive or Delete */}
          {isEditing ? (
            <View style={styles.dangerZone}>
              {hasSessions ? (
                <AppButton
                  label={uk.taskCrud.archive}
                  variant="secondary"
                  size="md"
                  onPress={handleArchive}
                />
              ) : (
                <AppButton
                  label={uk.taskCrud.delete}
                  variant="danger"
                  size="md"
                  onPress={handleDelete}
                />
              )}
              <AppText variant="caption" style={styles.fieldLabel}>
                {hasSessions ? uk.taskCrud.archiveHint : uk.taskCrud.deleteHint}
              </AppText>
            </View>
          ) : null}
        </ScrollView>

        {/* F4: full-width primary action pinned to the bottom of the screen. */}
        <View testID="taskedit-footer" style={[styles.footer, { paddingHorizontal: gutter }]}>
          <AppButton
            label={uk.taskCrud.save}
            variant="primary"
            size="lg"
            onPress={handleSave}
          />
        </View>

        {emojiPickerOpen ? (
          <EmojiPicker
            value={emoji}
            onSelect={(next) => {
              parentSessionStore.touch();
              setEmoji(next ?? '');
            }}
            onClose={() => setEmojiPickerOpen(false)}
          />
        ) : null}
      </View>
    </ParentGuard>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH.form, // forms never stretch across wide viewports (§4.4)
    alignSelf: 'center',
    backgroundColor: colors.background,
    gap: spacing.lg,
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
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: spacing.md,
    color: colors.text,
    minHeight: 56,
    fontSize: typography.body,
  },
  emojiField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: spacing.md,
    minHeight: 56,
    gap: spacing.sm,
  },
  emojiFieldValue: {
    color: colors.text,
  },
  emojiFieldHint: {
    color: colors.textSecondary,
    flexShrink: 1,
  },
  stepperRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
    gap: spacing.s12,
  },
  stepperButton: {
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
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    gap: spacing.sm,
  },
  dayButton: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayButtonSelected: {
    backgroundColor: colors.primary,
  },
  dayButtonUnselected: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
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
    borderTopColor: colors.divider,
    gap: spacing.md,
  },
  footer: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH.form,
    alignSelf: 'center',
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
});