import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  StyleSheet,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { MAX_ADDED_MS } from '../domain/timer/constants';
import { pauseBudgetLeft, remaining, runElapsed } from '../domain/timer/elapsed';
import { TimerState } from '../domain/timer/types';
import { Task } from '../domain/tasks/types';
import { RootStackParamList } from '../navigation/routes';
import { SessionRow } from '../services/repos/sessionsRepo';
import { restore } from '../services/timer/timerService';
import { useServices } from '../state/appServices';
import { useTimerStore } from '../state/timerStore';
import { AppText } from '../ui/components/AppText';
import { ProgressBar } from '../ui/components/ProgressBar';
import { TapTarget } from '../ui/components/TapTarget';
import { formatMinutesUk } from '../ui/components/TaskCard';
import { useOrientation } from '../ui/hooks/useOrientation';
import { uk } from '../i18n/uk';
import { colors, spacing, statusColors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Timer'>;

export function TimerScreen({ route, navigation }: Props) {
  const { clock, tasksRepo, sessionsRepo, wall } = useServices();
  const orientation = useOrientation();
  const isLandscape = orientation === 'landscape';

  const snapshot = useTimerStore((s) => s.snapshot);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const addTime = useTimerStore((s) => s.addTime);

  const [task, setTask] = useState<Task | null>(null);
  const [routeSession, setRouteSession] = useState<SessionRow | null>(null);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    let isMounted = true;
    void tasksRepo.get(route.params.taskId).then((t) => {
      if (isMounted) setTask(t);
    });
    return () => {
      isMounted = false;
    };
  }, [tasksRepo, route.params.taskId]);

  const refreshRouteSession = useCallback(() => {
    const seq = ++loadSeqRef.current;
    void (async () => {
      const todayDate = wall.todayLocalDate();
      let s = await sessionsRepo.getTodayForTask(route.params.taskId, todayDate);
      if (!s) {
        s = await sessionsRepo.getLatestForTask(route.params.taskId);
      }
      if (loadSeqRef.current === seq) {
        setRouteSession(s);
      }
    })();
  }, [sessionsRepo, wall, route.params.taskId]);

  // Initial load; invalidate in-flight loads on unmount/dep change.
  useEffect(() => {
    refreshRouteSession();
    return () => {
      loadSeqRef.current += 1;
    };
  }, [refreshRouteSession]);

  // Reload when the screen regains focus (PinGate -> goBack after verify/abandon).
  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', refreshRouteSession);
    return () => {
      unsubscribe?.();
    };
  }, [navigation, refreshRouteSession]);

  // Reload whenever a session mutation lands in the store. verify/abandon always
  // set a NEW snapshot object even when its fields are deep-equal (cold-start
  // path: Idle/null before and after), so identity is the signal to use.
  useEffect(() => {
    return useTimerStore.subscribe((state, prev) => {
      if (state.snapshot !== prev.snapshot) {
        refreshRouteSession();
      }
    });
  }, [refreshRouteSession]);

  // BackHandler navigation to Today
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.navigate('Today');
      return true;
    });
    return () => sub.remove();
  }, [navigation]);

  let displayState: TimerState;
  let displaySessionId: number | null;
  let isLive: boolean;

  if (
    snapshot.sessionId !== null &&
    snapshot.taskId === route.params.taskId &&
    (routeSession === null || routeSession.id === snapshot.sessionId)
  ) {
    displayState = snapshot.state;
    displaySessionId = snapshot.sessionId;
    isLive = true;
  } else if (routeSession !== null) {
    displayState = restore(routeSession, clock.now());
    displaySessionId = routeSession.id;
    isLive = false;
  } else {
    displayState = { kind: 'Idle' };
    displaySessionId = null;
    isLive = false;
  }

  // Keep awake while running
  useEffect(() => {
    if (isLive && displayState.kind === 'Running') {
      void activateKeepAwakeAsync();
      return () => {
        void deactivateKeepAwake();
      };
    } else {
      void deactivateKeepAwake();
    }
  }, [isLive, displayState.kind]);

  const now = clock.now();
  const remMs = remaining(displayState, now);
  const remSec = Math.ceil(remMs / 1000);
  const minutes = Math.floor(remSec / 60);
  const seconds = remSec % 60;
  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const totalMs =
    displayState.kind !== 'Idle' ? displayState.targetMs + displayState.addedMs : 0;
  const elapsedMs = displayState.kind !== 'Idle' ? runElapsed(displayState, now) : 0;

  // Accessibility announcements
  const prevKindRef = useRef(displayState.kind);
  const lastAnnouncedMinuteRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevKindRef.current;
    const current = displayState.kind;
    prevKindRef.current = current;

    if (prev === 'Paused' && current === 'Running') {
      AccessibilityInfo.announceForAccessibility(uk.timer.autoResumed);
    } else if (prev !== 'Completed' && current === 'Completed') {
      AccessibilityInfo.announceForAccessibility(uk.timer.completedAnnouncement);
    }
  }, [displayState.kind]);

  useEffect(() => {
    if (displayState.kind === 'Running') {
      const mins = Math.floor(remSec / 60);
      if (remSec > 0 && remSec % 60 === 0 && lastAnnouncedMinuteRef.current !== mins) {
        lastAnnouncedMinuteRef.current = mins;
        AccessibilityInfo.announceForAccessibility(`${mins} ${formatMinutesUk(mins)}`);
      }
    }
  }, [remSec, displayState.kind]);

  const budgetLeftMs = pauseBudgetLeft(displayState, now);
  const isPauseDisabled = budgetLeftMs <= 0;
  const isAddTimeDisabled = !(
    isLive &&
    (displayState.kind === 'Running' || displayState.kind === 'Paused') &&
    displayState.addedMs < MAX_ADDED_MS
  );

  const isCompleted = displayState.kind === 'Completed';
  const isVerified = displayState.kind === 'Verified';

  const handleBack = () => {
    navigation.navigate('Today');
  };

  const handleShowParent = () => {
    if (displaySessionId !== null) {
      navigation.navigate('PinGate', {
        intent: 'verify',
        sessionId: displaySessionId,
      });
    }
  };

  const layoutTestID = isLandscape ? 'timer-layout-landscape' : 'timer-layout-portrait';

  return (
    <View testID={layoutTestID} style={[styles.container, isLandscape && styles.containerLandscape]}>
      <View style={styles.topBar}>
        <TapTarget
          accessibilityRole="button"
          accessibilityLabel={uk.timer.back}
          onPress={handleBack}
          style={styles.backButton}
        >
          <AppText variant="body" style={styles.backButtonText}>
            {`← ${uk.timer.back}`}
          </AppText>
        </TapTarget>

        {task ? (
          <AppText variant="title" accessibilityRole="header" style={styles.taskTitle}>
            {task.emoji ? `${task.emoji} ${task.title}` : task.title}
          </AppText>
        ) : null}
      </View>

      <View style={[styles.content, isLandscape && styles.contentLandscape]}>
        {/* Digits & Progress Bar Section */}
        <View style={[styles.displaySection, isLandscape && styles.displaySectionLandscape]}>
          <AppText
            variant={isLandscape ? 'timerLandscape' : 'timer'}
            style={styles.digits}
          >
            {timeString}
          </AppText>

          <ProgressBar total={totalMs} elapsed={elapsedMs} style={styles.progressBar} />
        </View>

        {/* Controls Section */}
        <View style={[styles.controlsSection, isLandscape && styles.controlsSectionLandscape]}>
          {isCompleted ? (
            <View style={styles.completedBox}>
              <AppText variant="title" style={styles.awaitingText}>
                {uk.timer.awaiting}
              </AppText>
              <TapTarget
                accessibilityRole="button"
                accessibilityLabel={uk.timer.showParent}
                disabled={displaySessionId === null}
                onPress={handleShowParent}
                style={[styles.showParentButton, displaySessionId === null && styles.disabledButton]}
              >
                <AppText variant="title" style={styles.showParentButtonText}>
                  {uk.timer.showParent}
                </AppText>
              </TapTarget>
            </View>
          ) : isVerified ? (
            <View style={styles.verifiedBox}>
              <AppText variant="title" style={styles.verifiedText}>
                {uk.timer.verified}
              </AppText>
            </View>
          ) : (
            <View style={[styles.buttonsRow, isLandscape && styles.buttonsColumnLandscape]}>
              {isLive && displayState.kind === 'Running' ? (
                <TapTarget
                  accessibilityRole="button"
                  accessibilityLabel={uk.timer.pause}
                  disabled={isPauseDisabled}
                  onPress={() => {
                    if (isLive) void pause();
                  }}
                  style={[styles.actionButton, isPauseDisabled && styles.disabledButton]}
                >
                  <AppText variant="title" style={styles.actionButtonText}>
                    {uk.timer.pause}
                  </AppText>
                </TapTarget>
              ) : isLive && displayState.kind === 'Paused' ? (
                <TapTarget
                  accessibilityRole="button"
                  accessibilityLabel={uk.timer.resume}
                  onPress={() => {
                    if (isLive) void resume();
                  }}
                  style={[styles.actionButton, styles.resumeButton]}
                >
                  <AppText variant="title" style={styles.actionButtonText}>
                    {uk.timer.resume}
                  </AppText>
                </TapTarget>
              ) : null}

              <TapTarget
                accessibilityRole="button"
                accessibilityLabel={uk.timer.addTime}
                disabled={isAddTimeDisabled}
                onPress={() => {
                  if (isLive) void addTime();
                }}
                style={[styles.actionButton, styles.addTimeButton, isAddTimeDisabled && styles.disabledButton]}
              >
                <AppText variant="title" style={styles.actionButtonText}>
                  {uk.timer.addTime}
                </AppText>
              </TapTarget>
            </View>
          )}
        </View>
      </View>
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
  containerLandscape: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    color: colors.textSecondary,
  },
  taskTitle: {
    flex: 1,
    marginLeft: spacing.md,
    color: colors.text,
  },
  content: {
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: spacing.xxl,
  },
  contentLandscape: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.md,
  },
  displaySection: {
    width: '100%',
    alignItems: 'center',
  },
  displaySectionLandscape: {
    flex: 1,
    marginRight: spacing.lg,
  },
  digits: {
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  progressBar: {
    width: '90%',
    marginVertical: spacing.md,
  },
  controlsSection: {
    width: '100%',
    alignItems: 'center',
  },
  controlsSectionLandscape: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    width: '100%',
  },
  buttonsColumnLandscape: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  actionButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.primary,
    minWidth: 140,
  },
  resumeButton: {
    backgroundColor: '#059669',
  },
  addTimeButton: {
    backgroundColor: '#4B5563',
  },
  disabledButton: {
    backgroundColor: colors.border,
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  completedBox: {
    alignItems: 'center',
    width: '100%',
  },
  awaitingText: {
    color: statusColors.awaiting.bg,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  showParentButton: {
    backgroundColor: statusColors.awaiting.bg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 16,
  },
  showParentButtonText: {
    color: statusColors.awaiting.text,
  },
  verifiedBox: {
    alignItems: 'center',
    backgroundColor: statusColors.verified.bg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: 16,
  },
  verifiedText: {
    color: statusColors.verified.text,
    textAlign: 'center',
  },
});
