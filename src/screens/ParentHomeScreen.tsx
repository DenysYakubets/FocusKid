import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { parentSessionStore } from '../state/parentSessionStore';
import { SessionRow } from '../services/repos/sessionsRepo';
import { MAX_FAILED_ATTEMPTS } from '../services/auth/authService';
import { Task } from '../domain/tasks/types';
import { AppText } from '../ui/components/AppText';
import { TapTarget } from '../ui/components/TapTarget';
import { PinPad } from '../ui/components/PinPad';
import { ParentGuard } from '../navigation/ParentGuard';
import { useOrientation } from '../ui/hooks/useOrientation';
import { uk } from '../i18n/uk';
import { colors, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ParentHome'>;

interface AwaitingItem {
  session: SessionRow;
  task: Task | null;
}

export function ParentHomeScreen({ navigation }: Props) {
  const { sessionsRepo, tasksRepo, authService } = useServices();
  const orientation = useOrientation();
  const isLandscape = orientation === 'landscape';

  const [awaitingItems, setAwaitingItems] = useState<AwaitingItem[]>([]);
  const [changingPin, setChangingPin] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [pinDraft, setPinDraft] = useState('');
  const [pinStep, setPinStep] = useState<1 | 2>(1);
  const [pinError, setPinError] = useState<string | null>(null);
  const [lockoutSec, setLockoutSec] = useState(0);

  // Monitor lockout countdown via monotonic clock
  useEffect(() => {
    const updateLockout = () => {
      const remMs = authService.lockoutRemainingMs();
      const sec = Math.ceil(remMs / 1000);
      setLockoutSec(sec);
    };

    updateLockout();
    const interval = setInterval(updateLockout, 500);
    interval.unref?.();
    return () => clearInterval(interval);
  }, [authService]);

  const isLocked = lockoutSec > 0;

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
    if (isLocked) return;
    parentSessionStore.touch();
    setPinDraft('');
    if (pinStep === 1) {
      setCurrentPinInput(entered);
      setPinStep(2);
      setPinError(null);
    } else {
      try {
        const ok = await authService.changePin(currentPinInput, entered);
        if (ok) {
          setChangingPin(false);
          setPinStep(1);
          setCurrentPinInput('');
          setPinError(null);
        } else {
          let msg: string = uk.pin.invalidPin;
          try {
            const failed = await authService.failedAttempts();
            const left = Math.max(0, MAX_FAILED_ATTEMPTS - failed);
            if (left > 0) {
              msg = `${uk.pin.invalidPin}. ${uk.pin.attemptsLeft(left)}`;
            }
          } catch {
            // Guard with try/catch
          }
          setPinError(msg);
          setPinStep(1);
          setCurrentPinInput('');
        }
      } catch {
        setPinError(uk.pin.operationFailed);
        setPinStep(1);
        setCurrentPinInput('');
      }
    }
  };

  return (
    <ParentGuard navigation={navigation}>
      <View
        testID={isLandscape ? 'parent-home-layout-landscape' : 'parent-home-layout-portrait'}
        style={[styles.container, isLandscape && styles.containerLandscape]}
      >
        {/* Header */}
        <View style={styles.header}>
          <AppText
            variant="title"
            accessibilityRole="header"
            numberOfLines={1}
            style={styles.title}
          >
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
              setPinDraft('');
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
              {pinStep === 1 ? uk.parentHome.enterCurrentPin : uk.parentHome.enterNewPin}
            </AppText>
            {isLocked ? (
              <View style={styles.lockoutBox}>
                <AppText variant="body" style={styles.lockoutText}>
                  {`${uk.pin.lockedRemaining} ${lockoutSec} ${uk.pin.seconds}`}
                </AppText>
              </View>
            ) : pinError ? (
              pinError.startsWith(uk.pin.invalidPin) && pinError.length > uk.pin.invalidPin.length ? (
                <AppText variant="body" style={styles.errorText}>
                  <AppText variant="body" style={styles.errorText}>
                    {uk.pin.invalidPin}
                  </AppText>
                  {pinError.slice(uk.pin.invalidPin.length)}
                </AppText>
              ) : (
                <AppText variant="body" style={styles.errorText}>
                  {pinError}
                </AppText>
              )
            ) : null}
            <PinPad
              disabled={isLocked}
              value={pinDraft}
              onChange={setPinDraft}
              onComplete={handleChangePinComplete}
            />
          </View>
        ) : null}

        {/* Awaiting verification list */}
        <View style={styles.awaitingSection}>
          <AppText variant="title" accessibilityRole="header" style={styles.sectionTitle}>
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
              onScroll={() => parentSessionStore.touch()}
              scrollEventThrottle={1000}
              renderItem={({ item }) => (
                <View style={styles.itemCard}>
                  <View style={styles.itemInfo}>
                    <AppText variant="title" style={styles.itemTitle}>
                      {item.task?.emoji
                        ? `${item.task.emoji} ${item.task.title}`
                        : item.task?.title ?? uk.parentHome.taskFallback}
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
  containerLandscape: {
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
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
  lockoutBox: {
    backgroundColor: '#FEF3C7',
    padding: spacing.md,
    borderRadius: 8,
    marginVertical: spacing.md,
  },
  lockoutText: {
    color: colors.awaiting,
    textAlign: 'center',
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
