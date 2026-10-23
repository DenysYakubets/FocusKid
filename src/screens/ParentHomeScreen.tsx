import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { parentSessionStore } from '../state/parentSessionStore';
import { SessionRow } from '../services/repos/sessionsRepo';
import { Task } from '../domain/tasks/types';
import { AppText } from '../ui/components/AppText';
import { TapTarget } from '../ui/components/TapTarget';
import { PinPad } from '../ui/components/PinPad';
import { ParentGuard } from '../navigation/ParentGuard';
import { uk } from '../i18n/uk';
import { colors, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ParentHome'>;

interface AwaitingItem {
  session: SessionRow;
  task: Task | null;
}

export function ParentHomeScreen({ navigation }: Props) {
  const { sessionsRepo, tasksRepo, authService } = useServices();

  const [awaitingItems, setAwaitingItems] = useState<AwaitingItem[]>([]);
  const [changingPin, setChangingPin] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinStep, setPinStep] = useState<1 | 2>(1);
  const [pinError, setPinError] = useState<string | null>(null);

  const loadData = async () => {
    const completedSessions = await sessionsRepo.listCompleted();
    const items: AwaitingItem[] = await Promise.all(
      completedSessions.map(async (s) => {
        const task = await tasksRepo.get(s.taskId);
        return { session: s, task };
      })
    );
    setAwaitingItems(items);
  };

  useEffect(() => {
    void loadData();
    const unsub = navigation.addListener('focus', () => {
      void loadData();
    });
    return unsub;
  }, [navigation, sessionsRepo, tasksRepo]);

  const handleExit = () => {
    parentSessionStore.exit();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Today' }],
    });
  };

  const handleVerify = (sessionId: number) => {
    parentSessionStore.touch();
    navigation.navigate('PinGate', { intent: 'verify', sessionId });
  };

  const handleAbandon = (sessionId: number) => {
    parentSessionStore.touch();
    navigation.navigate('PinGate', { intent: 'abandon', sessionId });
  };

  const handleChangePinComplete = async (entered: string) => {
    parentSessionStore.touch();
    if (pinStep === 1) {
      setCurrentPinInput(entered);
      setPinStep(2);
      setPinError(null);
    } else {
      const ok = await authService.changePin(currentPinInput, entered);
      if (ok) {
        setChangingPin(false);
        setPinStep(1);
        setCurrentPinInput('');
        setNewPinInput('');
        setPinError(null);
      } else {
        setPinError(uk.pin.invalidPin);
        setPinStep(1);
        setCurrentPinInput('');
        setNewPinInput('');
      }
    }
  };

  return (
    <ParentGuard navigation={navigation}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <AppText variant="title" style={styles.title}>
            {uk.parentHome.title}
          </AppText>
          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.parentHome.exit}
            onPress={handleExit}
            style={styles.exitButton}
          >
            <AppText variant="body" style={styles.exitText}>
              {uk.parentHome.exit}
            </AppText>
          </TapTarget>
        </View>

        {/* Navigation links */}
        <View style={styles.navRow}>
          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.parentHome.tasks}
            onPress={() => {
              parentSessionStore.touch();
              navigation.navigate('TaskListEdit');
            }}
            style={styles.navButton}
          >
            <AppText variant="body" style={styles.navButtonText}>
              {uk.parentHome.tasks}
            </AppText>
          </TapTarget>

          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.parentHome.stats}
            onPress={() => {
              parentSessionStore.touch();
              navigation.navigate('Stats');
            }}
            style={styles.navButton}
          >
            <AppText variant="body" style={styles.navButtonText}>
              {uk.parentHome.stats}
            </AppText>
          </TapTarget>

          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.parentHome.changePin}
            onPress={() => {
              parentSessionStore.touch();
              setChangingPin(!changingPin);
              setPinStep(1);
              setPinError(null);
            }}
            style={styles.navButton}
          >
            <AppText variant="body" style={styles.navButtonText}>
              {uk.parentHome.changePin}
            </AppText>
          </TapTarget>
        </View>

        {/* Change PIN section */}
        {changingPin ? (
          <View style={styles.changePinBox}>
            <AppText variant="body" style={styles.changePinPrompt}>
              {pinStep === 1 ? 'Введіть поточний PIN-код' : 'Введіть новий PIN-код'}
            </AppText>
            {pinError ? (
              <AppText variant="body" style={styles.errorText}>
                {pinError}
              </AppText>
            ) : null}
            <PinPad onComplete={handleChangePinComplete} />
          </View>
        ) : null}

        {/* Awaiting verification list */}
        <View style={styles.awaitingSection}>
          <AppText variant="title" style={styles.sectionTitle}>
            {uk.parentHome.awaitingTitle}
          </AppText>

          {awaitingItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <AppText variant="body" style={styles.emptyText}>
                {uk.parentHome.emptyAwaiting}
              </AppText>
            </View>
          ) : (
            <FlatList
              data={awaitingItems}
              keyExtractor={(item) => String(item.session.id)}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={styles.itemCard}>
                  <View style={styles.itemInfo}>
                    <AppText variant="title" style={styles.itemTitle}>
                      {item.task?.emoji
                        ? `${item.task.emoji} ${item.task.title}`
                        : item.task?.title ?? 'Завдання'}
                    </AppText>
                  </View>

                  <View style={styles.itemActions}>
                    <TapTarget
                      accessibilityRole="button"
                      accessibilityLabel={`${uk.parentHome.verify}: ${item.task?.title ?? ''}`}
                      onPress={() => handleVerify(item.session.id)}
                      style={styles.verifyButton}
                    >
                      <AppText variant="body" style={styles.verifyButtonText}>
                        {uk.parentHome.verify}
                      </AppText>
                    </TapTarget>

                    <TapTarget
                      accessibilityRole="button"
                      accessibilityLabel={`${uk.parentHome.abandon}: ${item.task?.title ?? ''}`}
                      onPress={() => handleAbandon(item.session.id)}
                      style={styles.abandonButton}
                    >
                      <AppText variant="body" style={styles.abandonButtonText}>
                        {uk.parentHome.abandon}
                      </AppText>
                    </TapTarget>
                  </View>
                </View>
              )}
            />
          )}
        </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
  },
  exitButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exitText: {
    color: colors.abandoned,
  },
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  navButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navButtonText: {
    color: colors.primary,
  },
  changePinBox: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 12,
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  changePinPrompt: {
    color: colors.text,
    marginBottom: spacing.sm,
  },
  errorText: {
    color: colors.abandoned,
    marginBottom: spacing.sm,
  },
  awaitingSection: {
    flex: 1,
  },
  sectionTitle: {
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
  },
  listContent: {
    gap: spacing.md,
  },
  itemCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  itemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemTitle: {
    color: colors.text,
  },
  itemActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  verifyButton: {
    flex: 1,
    backgroundColor: colors.verified,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  verifyButtonText: {
    color: colors.white,
  },
  abandonButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.abandoned,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  abandonButtonText: {
    color: colors.abandoned,
  },
});
