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
import { AppButton } from '../ui/components/AppButton';
import { AppText } from '../ui/components/AppText';
import { NoticeBox } from '../ui/components/NoticeBox';
import { ProgressBar } from '../ui/components/ProgressBar';
import { ScreenTopBar } from '../ui/components/ScreenTopBar';
import { formatMinutesUk } from '../ui/components/TaskCard';
import { useScreenGutter } from '../ui/hooks/useScreenGutter';
import { uk } from '../i18n/uk';
import { colors, radius, shadows, spacing, statusColors } from '../ui/theme';
import { mapTimerError } from '../ui/timerErrors';

type Props = NativeStackScreenProps<RootStackParamList, 'Timer'>;

/** Landscape side column narrower than this stacks the actions full-width. */
const STACK_ACTION_COLUMN_DP = 260;

export function TimerScreen({ route, navigation }: Props) {
  const { clock, tasksRepo, sessionsRepo, wall } = useServices();
  const { width, gutter, isLandscape } = useScreenGutter();

  const snapshot = useTimerStore((s) => s.snapshot);
  const lastError = useTimerStore((s) => s.lastError);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const addTime = useTimerStore((s) => s.addTime);
  const stop = useTimerStore((s) => s.stop);

  const [task, setTask] = useState<Task | null>(null);
  const [routeSession, setRouteSession] = useState<SessionRow | null>(null);
  const [showStopDialog, setShowStopDialog] = useState(false);
  const loadSeqRef = useRef(0);
  const restoredBaseRef = useRef<{ key: string; base: number }>({ key: '', base: 0 });

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
    displaySessionId = routeSession.id;
    const key = `${displaySessionId}:${routeSession.updatedAt}:${routeSession.status}`;
    if (restoredBaseRef.current.key !== key) {
      restoredBaseRef.current = { key, base: clock.now() };
    }
    displayState = restore(routeSession, restoredBaseRef.current.base);
    isLive = false;
  } else {
    displayState = { kind: 'Idle' };
    displaySessionId = null;
    isLive = false;
  }

  // Local 1s ticker to guarantee 1 Hz re-render while Running or Paused
  const [, setSecond] = useState(0);
  useEffect(() => {
    if (displayState.kind !== 'Running' && displayState.kind !== 'Paused') {
      return;
    }
    const interval = setInterval(() => {
      setSecond((v) => v + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [displayState.kind]);

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
  const isPaused = displayState.kind === 'Paused';

  const handleBack = () => {
    navigation.navigate('Today');
  };

  const handlePause = async () => {
    if (isLive) {
      await pause();
    }
  };

  const handleResume = async () => {
    if (isLive) {
      await resume();
    }
  };

  const handleAddTime = async () => {
    if (isLive) {
      await addTime();
    }
  };

  const handleShowParent = () => {
    if (displaySessionId !== null) {
      navigation.navigate('PinGate', {
        intent: 'verify',
        sessionId: displaySessionId,
      });
    }
  };

  // F3: child-initiated stop — confirm first, then terminate the session.
  const canStop =
    isLive && (displayState.kind === 'Running' || displayState.kind === 'Paused');

  const handleStopConfirm = async () => {
    const ok = await stop();
    setShowStopDialog(false);
    if (ok) {
      navigation.navigate('Today');
    }
  };

  const layoutTestID = isLandscape ? 'timer-layout-landscape' : 'timer-layout-portrait';

  // §4.3: two flex:1 buttons in a row — no minWidth, so nothing clips at 320dp.
  const sideColumnWidth = (width - 2 * gutter - spacing.xl) / 2;
  const stackSideActions = isLandscape && sideColumnWidth < STACK_ACTION_COLUMN_DP;
  const buttonStyle = stackSideActions ? undefined : styles.flexButton;

  const displayNode = (
    <View style={styles.displayZone}>
      <AppText
        variant={isLandscape ? 'timerLandscape' : 'timer'}
        style={styles.digits}
      >
        {timeString}
      </AppText>
      <ProgressBar total={totalMs} elapsed={elapsedMs} style={styles.progressBar} />
    </View>
  );

  const pauseHintNode = isPaused ? (
    <View style={styles.pauseHint}>
      {budgetLeftMs > 0 ? (
        <>
          <AppText variant="caption" style={styles.pauseHintText}>
            {`${uk.timer.pauseLeft} ${Math.floor(budgetLeftMs / 60000)}:${String(
              Math.floor((budgetLeftMs % 60000) / 1000)
            ).padStart(2, '0')}`}
          </AppText>
          {budgetLeftMs < 60000 ? (
            <AppText variant="caption" style={styles.pauseHintText}>
              {`Часу паузи ${uk.timer.minuteLeft} менше хвилини.`}
            </AppText>
          ) : null}
        </>
      ) : (
        <AppText variant="caption" style={styles.pauseHintText}>
          {uk.timer.pauseBudgetExhausted}
        </AppText>
      )}
    </View>
  ) : null;

  const stateNode = isCompleted ? (
    <AppText variant="heading" style={styles.awaitingText}>
      {uk.timer.awaiting}
    </AppText>
  ) : isVerified ? (
    <View style={styles.verifiedBox}>
      <AppText variant="heading" style={styles.verifiedText}>
        {uk.timer.verified}
      </AppText>
    </View>
  ) : null;

  const actionControls = isCompleted ? (
    <AppButton
      label={uk.timer.showParent}
      variant="primary"
      size="lg"
      disabled={displaySessionId === null}
      onPress={handleShowParent}
      style={isLandscape ? undefined : styles.flexButton}
    />
  ) : isVerified ? null : (
    <>
      {isLive && displayState.kind === 'Running' ? (
        <AppButton
          label={uk.timer.pause}
          variant="primary"
          size="lg"
          disabled={isPauseDisabled}
          onPress={() => {
            void handlePause();
          }}
          style={buttonStyle}
        />
      ) : isLive && displayState.kind === 'Paused' ? (
        <AppButton
          label={uk.timer.resume}
          variant="success"
          size="lg"
          onPress={() => {
            void handleResume();
          }}
          style={buttonStyle}
        />
      ) : null}

      <AppButton
        label={uk.timer.addTime}
        variant="secondary"
        size="lg"
        disabled={isAddTimeDisabled}
        onPress={() => {
          void handleAddTime();
        }}
        style={buttonStyle}
      />
    </>
  );

  const actionRow =
    actionControls === null ? null : (
      <View
        style={[styles.actionRow, stackSideActions && styles.actionRowStacked]}
      >
        {actionControls}
      </View>
    );

  const bottomNode = (
    <View style={styles.bottomZone}>
      {pauseHintNode}
      {stateNode}
      {actionRow}
      {canStop ? (
        <AppButton
          label={uk.timer.stop}
          variant="danger"
          size="md"
          onPress={() => setShowStopDialog(true)}
        />
      ) : null}
    </View>
  );

  return (
    <>
      <View
        testID={layoutTestID}
        style={[styles.container, { paddingHorizontal: gutter }]}
      >
        <ScreenTopBar
          onBack={handleBack}
          title={task ? (task.emoji ? `${task.emoji} ${task.title}` : task.title) : undefined}
        />

        {lastError ? <NoticeBox tone="error" message={mapTimerError(lastError)} /> : null}

        {isLandscape ? (
          <View style={styles.landscapeRow}>
            {displayNode}
            <View style={styles.sideZone}>{bottomNode}</View>
          </View>
        ) : (
          <>
            {displayNode}
            {bottomNode}
          </>
        )}
      </View>

      {/* F3 confirm dialog: full-screen card, the same shape as PinGate's. */}
      {showStopDialog ? (
        <View testID="timer-stop-dialog" style={styles.dialogContainer}>
          <View style={styles.dialogCard}>
            <AppText variant="title" accessibilityRole="header" style={styles.dialogTitle}>
              {uk.timer.stopTitle}
            </AppText>
            <AppText variant="body" style={styles.dialogMessage}>
              {uk.timer.stopMessage}
            </AppText>
            <View style={styles.dialogButtons}>
              <AppButton
                label={uk.timer.stopConfirm}
                variant="danger"
                size="lg"
                onPress={() => {
                  void handleStopConfirm();
                }}
              />
              <AppButton
                label={uk.timer.stopCancel}
                variant="secondary"
                size="lg"
                onPress={() => setShowStopDialog(false)}
              />
            </View>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xl,
  },
  displayZone: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  digits: {
    color: colors.text,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  progressBar: {
    width: '100%',
  },
  bottomZone: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  landscapeRow: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  sideZone: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    alignItems: 'stretch',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.s12,
    width: '100%',
    paddingVertical: spacing.lg,
  },
  actionRowStacked: {
    flexDirection: 'column',
  },
  flexButton: {
    flex: 1,
  },
  pauseHint: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  pauseHintText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  awaitingText: {
    color: colors.awaiting,
    textAlign: 'center',
  },
  verifiedBox: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: statusColors.verified.bg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  verifiedText: {
    color: statusColors.verified.text,
    textAlign: 'center',
  },
  dialogContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    boxShadow: shadows.overlay,
    alignItems: 'center',
    maxWidth: 480,
    width: '100%',
    gap: spacing.lg,
  },
  dialogTitle: {
    color: colors.text,
    textAlign: 'center',
  },
  dialogMessage: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  dialogButtons: {
    width: '100%',
    gap: spacing.md,
  },
});