import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { useTimerStore, timerStore } from '../state/timerStore';
import { tasksStore } from '../state/tasksStore';
import { parentSessionStore, useParentSessionStore } from '../state/parentSessionStore';
import { ParentToken, MAX_FAILED_ATTEMPTS } from '../services/auth/authService';
import { AppButton } from '../ui/components/AppButton';
import { AppText } from '../ui/components/AppText';
import { NoticeBox } from '../ui/components/NoticeBox';
import { PinPad } from '../ui/components/PinPad';
import { ScreenTopBar } from '../ui/components/ScreenTopBar';
import { useOrientation } from '../ui/hooks/useOrientation';
import { uk } from '../i18n/uk';
import { colors, radius, shadows, spacing } from '../ui/theme';
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
      <View style={styles.dialogContainer}>
        <View style={styles.dialogCard}>
          <AppText variant="title" accessibilityRole="header" style={styles.dialogTitle}>
            {uk.parentHome.abandonDialogTitle}
          </AppText>
          <AppText variant="body" style={styles.dialogMessage}>
            {uk.parentHome.abandonDialogMessage}
          </AppText>

          <View style={styles.dialogButtons}>
            <AppButton
              label={uk.parentHome.confirmAbandon}
              variant="danger"
              size="lg"
              onPress={handleConfirmAbandon}
            />
            <AppButton
              label={uk.parentHome.cancelAbandon}
              variant="secondary"
              size="lg"
              onPress={handleCancelAbandon}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      testID={isLandscape ? 'pingate-layout-landscape' : 'pingate-layout-portrait'}
      style={styles.container}
    >
      {/* The whole gate scrolls, so nothing clips at font scale 3.0 (§4.1). */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isLandscape && styles.scrollContentLandscape,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenTopBar onBack={() => navigation.goBack()} />

        <View style={isLandscape ? styles.contentLandscape : styles.contentPortrait}>
          <View
            style={[
              styles.header,
              isLandscape ? styles.headerLandscape : styles.headerPortrait,
            ]}
          >
            <AppText
              variant="title"
              accessibilityRole="header"
              numberOfLines={2}
              style={styles.title}
            >
              {getTitle()}
            </AppText>
            <AppText variant="body" style={styles.subtitle}>
              {uk.pin.enterPin}
            </AppText>

            {isLocked ? (
              <NoticeBox
                testID="pingate-lockout"
                tone="warning"
                message={`${uk.pin.lockedRemaining} ${lockoutSec} ${uk.pin.seconds}`}
              />
            ) : error ? (
              <NoticeBox testID="pingate-error" tone="error" message={error} />
            ) : null}
          </View>

          <PinPad
            disabled={isLocked}
            value={pinValue}
            onChange={setPinValue}
            onComplete={handleComplete}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    // §4.1: the gate keeps the lg gutter (272dp content at 320dp).
    padding: spacing.lg,
    gap: spacing.md,
  },
  scrollContentLandscape: {
    paddingHorizontal: spacing.xl,
  },
  contentPortrait: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    gap: spacing.md,
  },
  contentLandscape: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerPortrait: {
    width: '100%',
  },
  // §4.1 landscape two-column: the left column must shrink instead of claiming
  // 100% of the row — with RN's default flexShrink 0 that left the right keypad
  // column 0dp wide (INV-08 regression).
  headerLandscape: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  dialogContainer: {
    flex: 1,
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