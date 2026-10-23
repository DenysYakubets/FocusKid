import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { useTimerStore, timerStore } from '../state/timerStore';
import { tasksStore } from '../state/tasksStore';
import { parentSessionStore, useParentSessionStore } from '../state/parentSessionStore';
import { ParentToken, MAX_FAILED_ATTEMPTS } from '../services/auth/authService';
import { AppText } from '../ui/components/AppText';
import { PinPad } from '../ui/components/PinPad';
import { TapTarget } from '../ui/components/TapTarget';
import { useOrientation } from '../ui/hooks/useOrientation';
import { uk } from '../i18n/uk';
import { colors, spacing } from '../ui/theme';
import { mapTimerError } from '../ui/timerErrors';

type Props = NativeStackScreenProps<RootStackParamList, 'PinGate'>;

export function PinGateScreen({ route, navigation }: Props) {
  const { clock, authService } = useServices();
  const orientation = useOrientation();
  const isLandscape = orientation === 'landscape';

  const pinValue = useParentSessionStore((s) => s.pinDraft);
  const setPinDraft = useParentSessionStore((s) => s.setPinDraft);
  const clearPinDraft = useParentSessionStore((s) => s.clearPinDraft);
  const setPinValue = (p: string) => setPinDraft(p);

  const [error, setError] = useState<string | null>(null);
  const [lockoutSec, setLockoutSec] = useState(0);
  const [showAbandonDialog, setShowAbandonDialog] = useState(false);
  const [abandonToken, setAbandonToken] = useState<ParentToken | null>(null);

  // Monitor lockout countdown via monotonic clock
  useEffect(() => {
    const updateLockout = () => {
      const remMs = authService.lockoutRemainingMs();
      const sec = Math.ceil(remMs / 1000);
      setLockoutSec(sec);
    };

    updateLockout();
    const interval = setInterval(updateLockout, 500);
    return () => clearInterval(interval);
  }, [authService]);

  const isLocked = lockoutSec > 0;

  const handleComplete = async (completedPin: string) => {
    if (isLocked) return;

    try {
      const res = await parentSessionStore.attempt(completedPin, route.params);

      if (res.status === 'LOCKED') {
        clearPinDraft();
        setError(null);
        const sec = Math.ceil((res.remainingMs ?? authService.lockoutRemainingMs()) / 1000);
        setLockoutSec(sec);
      } else if (res.status === 'INVALID') {
        clearPinDraft();
        let msg: string = uk.pin.invalidPin;
        try {
          const failed = await authService.failedAttempts();
          const left = Math.max(0, MAX_FAILED_ATTEMPTS - failed);
          if (left > 0) {
            msg = `${uk.pin.invalidPin}. ${uk.pin.attemptsLeft(left)}`;
          }
        } catch {
          // Guard with its own try/catch so a DB error cannot break the flow
        }
        setError(msg);
      } else if (res.ok && res.status === 'SUCCESS') {
        clearPinDraft();
        setError(null);

        if (route.params.intent === 'enterParent') {
          parentSessionStore.touch(clock.now());
          navigation.replace('ParentHome');
        } else if (route.params.intent === 'verify') {
          const token = res.token;
          const ok = await timerStore.verify(route.params.sessionId, token);
          if (!ok) {
            setError(mapTimerError(useTimerStore.getState().lastError));
            return;
          }
          await tasksStore.refreshToday();
          navigation.goBack();
        } else if (route.params.intent === 'abandon') {
          const token = res.token;
          setAbandonToken(token ?? null);
          setShowAbandonDialog(true);
        }
      }
    } catch {
      clearPinDraft();
      let errorMsg: string;
      if (route.params.intent === 'verify') {
        errorMsg = uk.pin.verifyFailed;
      } else if (route.params.intent === 'abandon') {
        errorMsg = uk.pin.abandonFailed;
      } else {
        errorMsg = uk.pin.operationFailed;
      }
      setError(errorMsg);
      return;
    }
  };

  const handleConfirmAbandon = async () => {
    try {
      if (abandonToken && route.params.intent === 'abandon') {
        const ok = await timerStore.abandon(route.params.sessionId, abandonToken);
        if (!ok) {
          setError(uk.pin.abandonFailed);
          setShowAbandonDialog(false);
          return;
        }
        await tasksStore.refreshToday();
      }
      navigation.goBack();
    } catch {
      setError(uk.pin.abandonFailed);
      setShowAbandonDialog(false);
    }
  };

  const handleCancelAbandon = () => {
    navigation.goBack();
  };

  const getTitle = () => {
    if (route.params.intent === 'enterParent') return uk.pin.gateTitle;
    if (route.params.intent === 'verify') return uk.pin.verifyTitle;
    return uk.pin.abandonTitle;
  };

  if (showAbandonDialog) {
    return (
      <View style={styles.container}>
        <View style={styles.dialogCard}>
          <AppText variant="title" style={styles.dialogTitle}>
            {uk.parentHome.abandonDialogTitle}
          </AppText>
          <AppText variant="body" style={styles.dialogMessage}>
            {uk.parentHome.abandonDialogMessage}
          </AppText>

          <View style={styles.dialogButtons}>
            <TapTarget
              accessibilityRole="button"
              accessibilityLabel={uk.parentHome.confirmAbandon}
              onPress={handleConfirmAbandon}
              style={[styles.dialogButton, styles.confirmButton]}
            >
              <AppText variant="title" style={styles.confirmButtonText}>
                {uk.parentHome.confirmAbandon}
              </AppText>
            </TapTarget>

            <TapTarget
              accessibilityRole="button"
              accessibilityLabel={uk.parentHome.cancelAbandon}
              onPress={handleCancelAbandon}
              style={[styles.dialogButton, styles.cancelButton]}
            >
              <AppText variant="title" style={styles.cancelButtonText}>
                {uk.parentHome.cancelAbandon}
              </AppText>
            </TapTarget>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      testID={isLandscape ? 'pingate-layout-landscape' : 'pingate-layout-portrait'}
      style={[styles.container, isLandscape && styles.containerLandscape]}
    >
      <View style={styles.topBar}>
        <TapTarget
          accessibilityRole="button"
          accessibilityLabel={uk.timer.back}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <AppText variant="body" style={styles.backButtonText}>
            {`← ${uk.timer.back}`}
          </AppText>
        </TapTarget>
      </View>

      <View style={isLandscape ? styles.contentLandscape : styles.contentPortrait}>
        <View style={isLandscape ? styles.leftSectionLandscape : styles.header}>
          <AppText variant="title" accessibilityRole="header" style={styles.title}>
            {getTitle()}
          </AppText>
          <AppText variant="body" style={styles.subtitle}>
            {uk.pin.enterPin}
          </AppText>

          {isLocked ? (
            <View style={styles.lockoutBox}>
              <AppText variant="body" style={styles.lockoutText}>
                {`${uk.pin.lockedRemaining} ${lockoutSec} ${uk.pin.seconds}`}
              </AppText>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              {error.startsWith(uk.pin.invalidPin) && error.length > uk.pin.invalidPin.length ? (
                <AppText variant="body" style={styles.errorText}>
                  <AppText variant="body" style={styles.errorText}>
                    {uk.pin.invalidPin}
                  </AppText>
                  {error.slice(uk.pin.invalidPin.length)}
                </AppText>
              ) : (
                <AppText variant="body" style={styles.errorText}>
                  {error}
                </AppText>
              )}
            </View>
          ) : null}
        </View>

        <View style={isLandscape ? styles.rightSectionLandscape : undefined}>
          <PinPad
            disabled={isLocked}
            value={pinValue}
            onChange={setPinValue}
            onComplete={handleComplete}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  containerLandscape: {
    paddingHorizontal: spacing.xl,
  },
  contentLandscape: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
  },
  contentPortrait: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  leftSectionLandscape: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  rightSectionLandscape: {
    flex: 1,
    alignItems: 'center',
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: spacing.sm,
  },
  backButtonText: {
    color: colors.primary,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    textAlign: 'center',
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
  errorContainer: {
    backgroundColor: '#FEE2E2',
    padding: spacing.md,
    borderRadius: 8,
    marginVertical: spacing.md,
  },
  errorText: {
    color: colors.abandoned,
    textAlign: 'center',
  },
  dialogCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    maxWidth: 480,
    width: '100%',
    gap: spacing.lg,
    marginVertical: 'auto',
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
  dialogButton: {
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    backgroundColor: colors.abandoned,
  },
  confirmButtonText: {
    color: colors.white,
  },
  cancelButton: {
    backgroundColor: colors.border,
  },
  cancelButtonText: {
    color: colors.text,
  },
});
