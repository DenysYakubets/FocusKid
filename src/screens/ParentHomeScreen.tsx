import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { parentSessionStore } from '../state/parentSessionStore';
import { SessionRow } from '../services/repos/sessionsRepo';
import { MAX_FAILED_ATTEMPTS } from '../services/auth/authService';
import { Task } from '../domain/tasks/types';
import { AppButton } from '../ui/components/AppButton';
import { AppText } from '../ui/components/AppText';
import { NoticeBox } from '../ui/components/NoticeBox';
import { PinPad } from '../ui/components/PinPad';
import { ParentGuard } from '../navigation/ParentGuard';
import { useOrientation } from '../ui/hooks/useOrientation';
import { uk } from '../i18n/uk';
import { colors, radius, shadows, spacing } from '../ui/theme';

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

  const handleChangePin = () => {
    parentSessionStore.touch();
    setChangingPin(!changingPin);
    setPinStep(1);
    setPinError(null);
    setPinDraft('');
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

  const headerNode = (
    <View style={styles.header}>
      <AppText
        variant="title"
        accessibilityRole="header"
        numberOfLines={1}
        style={styles.title}
      >
        {uk.parentHome.title}
      </AppText>
      <AppButton
        label={uk.parentHome.exit}
        variant="danger"
        size="sm"
        onPress={handleExit}
      />
    </View>
  );

  // §4.6: deterministic stacked column replaces the wrapping chip row.
  const navNode = (
    <View style={styles.navColumn}>
      <AppButton
        label={uk.parentHome.tasks}
        variant="secondary"
        size="lg"
        onPress={() => {
          parentSessionStore.touch();
          navigation.navigate('TaskListEdit');
        }}
      />
      <AppButton
        label={uk.parentHome.stats}
        variant="secondary"
        size="lg"
        onPress={() => {
          parentSessionStore.touch();
          navigation.navigate('Stats');
        }}
      />
      <AppButton
        label={uk.parentHome.changePin}
        variant="secondary"
        size="lg"
        onPress={handleChangePin}
      />
    </View>
  );

  const changePinNode = changingPin ? (
    <View style={styles.changePinBox}>
      <AppText variant="body" style={styles.changePinPrompt}>
        {pinStep === 1 ? uk.parentHome.enterCurrentPin : uk.parentHome.enterNewPin}
      </AppText>
      {isLocked ? (
        <NoticeBox
          testID="parenthome-lockout"
          tone="warning"
          message={`${uk.pin.lockedRemaining} ${lockoutSec} ${uk.pin.seconds}`}
        />
      ) : pinError ? (
        <NoticeBox testID="parenthome-pinerror" tone="error" message={pinError} />
      ) : null}
      <PinPad
        disabled={isLocked}
        value={pinDraft}
        onChange={setPinDraft}
        onComplete={handleChangePinComplete}
      />
    </View>
  ) : null;

  const awaitingNode = (
    <View style={styles.awaitingSection}>
      <AppText variant="heading" accessibilityRole="header" style={styles.sectionTitle}>
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
          style={styles.list}
          data={awaitingItems}
          keyExtractor={(item) => String(item.session.id)}
          contentContainerStyle={styles.listContent}
          onScroll={() => parentSessionStore.touch()}
          scrollEventThrottle={1000}
          renderItem={({ item }) => (
            <View style={styles.itemCard}>
              <View style={styles.itemInfo}>
                <AppText variant="title" numberOfLines={2} style={styles.itemTitle}>
                  {item.task?.emoji
                    ? `${item.task.emoji} ${item.task.title}`
                    : item.task?.title ?? uk.parentHome.taskFallback}
                </AppText>
              </View>

              <View style={styles.itemActions}>
                <AppButton
                  label={uk.parentHome.verify}
                  variant="primary"
                  size="md"
                  onPress={() => handleVerify(item.session.id)}
                  style={styles.actionFlex}
                />
                <AppButton
                  label={uk.parentHome.abandon}
                  variant="danger"
                  size="md"
                  onPress={() => handleAbandon(item.session.id)}
                  style={styles.actionFlex}
                />
              </View>
            </View>
          )}
        />
      )}
    </View>
  );

  return (
    <ParentGuard navigation={navigation}>
      <View
        testID={isLandscape ? 'parent-home-layout-landscape' : 'parent-home-layout-portrait'}
        style={[styles.container, isLandscape && styles.containerLandscape]}
      >
        {isLandscape ? (
          // INV-08: left = header + nav + change-PIN, right = awaiting list.
          <View style={styles.landscapeRow}>
            <View style={styles.leftColumn}>
              {headerNode}
              {navNode}
              {changePinNode}
            </View>
            <View style={styles.rightColumn}>{awaitingNode}</View>
          </View>
        ) : (
          <>
            {headerNode}
            {navNode}
            {changePinNode}
            {awaitingNode}
          </>
        )}
      </View>
    </ParentGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  containerLandscape: {
    paddingHorizontal: spacing.xl,
  },
  landscapeRow: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xl,
  },
  leftColumn: {
    flex: 1,
    gap: spacing.lg,
  },
  rightColumn: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    columnGap: spacing.sm,
  },
  title: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    color: colors.text,
  },
  navColumn: {
    gap: spacing.sm,
  },
  changePinBox: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    width: '100%',
    gap: spacing.md,
  },
  changePinPrompt: {
    color: colors.text,
    textAlign: 'center',
  },
  awaitingSection: {
    flex: 1,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  itemCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadows.card,
    padding: spacing.md,
    gap: spacing.md,
  },
  itemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemTitle: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    color: colors.text,
  },
  itemActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s12,
  },
  actionFlex: {
    flex: 1,
  },
});