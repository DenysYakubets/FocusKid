import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { useTimerStore, timerStore } from '../state/timerStore';
import { tasksStore } from '../state/tasksStore';
import { parentSessionStore } from '../state/parentSessionStore';
import { ParentToken } from '../services/auth/authService';
import { AppText } from '../ui/components/AppText';
import { PinPad } from '../ui/components/PinPad';
import { TapTarget } from '../ui/components/TapTarget';
import { uk } from '../i18n/uk';
import { colors, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PinGate'>;

export function PinGateScreen({ route, navigation }: Props) {
  const { clock, authService } = useServices();

  const [pinValue, setPinValue] = useState('');
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

    const res = await parentSessionStore.attempt(completedPin, route.params);

    if (res.status === 'LOCKED') {
      setPinValue('');
      setError(null);
      const sec = Math.ceil((res.remainingMs ?? authService.lockoutRemainingMs()) / 1000);
      setLockoutSec(sec);
    } else if (res.status === 'INVALID') {
      setPinValue('');
      setError(uk.pin.invalidPin);
    } else if (res.ok && res.status === 'SUCCESS') {
      setPinValue('');
      setError(null);

      if (route.params.intent === 'enterParent') {
        parentSessionStore.touch(clock.now());
        navigation.replace('ParentHome');
      } else if (route.params.intent === 'verify') {
        const token = res.token ?? authService.issueToken();
        await timerStore.verify(route.params.sessionId, token);
        await tasksStore.refreshToday();
        navigation.goBack();
      } else if (route.params.intent === 'abandon') {
        const token = res.token ?? authService.issueToken();
        setAbandonToken(token);
        setShowAbandonDialog(true);
      }
    }
  };

  const handleConfirmAbandon = async () => {
    if (abandonToken && route.params.intent === 'abandon') {
      await timerStore.abandon(route.params.sessionId, abandonToken);
      await tasksStore.refreshToday();
    }
    navigation.goBack();
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
    <View style={styles.container}>
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

      <View style={styles.header}>
        <AppText variant="title" style={styles.title}>
          {getTitle()}
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          {uk.pin.enterPin}
        </AppText>
      </View>

      {isLocked ? (
        <View style={styles.lockoutBox}>
          <AppText variant="body" style={styles.lockoutText}>
            {`${uk.pin.lockedRemaining} ${lockoutSec} ${uk.pin.seconds}`}
          </AppText>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <AppText variant="body" style={styles.errorText}>
            {error}
          </AppText>
        </View>
      ) : null}

      <PinPad
        disabled={isLocked}
        value={pinValue}
        onChange={setPinValue}
        onComplete={handleComplete}
      />
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
