import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { openExpoDb } from './src/services/db/expoDb';
import { migrate } from './src/services/db/migrations';
import { seedIfEmpty } from './src/services/db/seed';
import { systemMonotonicClock } from './src/services/clock/monotonic';
import { systemWallClock } from './src/services/clock/wallClock';
import { AppServices, createAppServices, AppServicesProvider } from './src/state/appServices';
import { AppLifecycle } from './src/state/AppLifecycle';
import { timerStore } from './src/state/timerStore';
import { tasksStore } from './src/state/tasksStore';
import { parentSessionStore } from './src/state/parentSessionStore';
import { useMascotStore } from './src/state/mascotStore';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ErrorBoundary } from './src/ui/components/ErrorBoundary';
import { AppFrame } from './src/ui/components/AppFrame';
import { AppText } from './src/ui/components/AppText';
import { TapTarget } from './src/ui/components/TapTarget';
import { uk } from './src/i18n/uk';
import { colors, spacing } from './src/ui/theme';

import { logInfo, logError } from './src/services/logging/fileLogger';
import { RootStackParamList } from './src/navigation/routes';

export function AppBootstrap() {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const logRoute = () => {
    const route = navigationRef.getCurrentRoute();
    if (route) void logInfo(`Navigation: ${route.name}`);
  };
  const [services, setServices] = useState<AppServices | null>(null);
  const [initError, setInitError] = useState<unknown>(null);
  const [initAttempt, setInitAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const db = await openExpoDb();
        await migrate(db);
        await seedIfEmpty(db, systemWallClock);

        const svc = createAppServices({
          db,
          clock: systemMonotonicClock,
          wall: systemWallClock,
        });

        timerStore.setService(svc.timerService);
        await timerStore.hydrate();
        tasksStore.setServices(svc);
        await tasksStore.refreshToday();
        parentSessionStore.setService(svc.authService);
        // C5: read the persisted companion choice once, at bootstrap.
        await useMascotStore.getState().hydrate(svc);

        if (mounted) {
          setServices(svc);
        }
      } catch (err) {
        console.error('Failed to initialize app', err);
        void logError(`App initialization failed: ${String(err)}`);
        if (mounted) {
          setInitError(err);
        }
      }
    }
    void init();
    return () => {
      mounted = false;
    };
  }, [initAttempt]);

  if (initError) {
    const cause = initError instanceof Error ? initError.message : String(initError);
    return (
      <View style={styles.errorContainer}>
        <AppText variant="title" accessibilityRole="header" style={styles.errorTitle}>
          {uk.errorBoundary.title}
        </AppText>
        <AppText variant="body" style={styles.errorCause}>
          {cause}
        </AppText>
        <TapTarget
          accessibilityRole="button"
          accessibilityLabel={uk.errorBoundary.retry}
          onPress={() => {
            setInitError(null);
            setInitAttempt((n) => n + 1);
          }}
          style={styles.retryButton}
        >
          <AppText variant="body" style={styles.retryText}>
            {uk.errorBoundary.retry}
          </AppText>
        </TapTarget>
      </View>
    );
  }

  if (!services) {
    return (
      <View style={styles.loadingContainer}>
        <AppText variant="title">{uk.loading}</AppText>
      </View>
    );
  }

  return (
    <AppServicesProvider services={services}>
      <AppLifecycle />
      <SafeAreaProvider>
        <AppFrame>
          <NavigationContainer ref={navigationRef} onReady={logRoute} onStateChange={logRoute}>
            <ErrorBoundary>
              <RootNavigator />
            </ErrorBoundary>
          </NavigationContainer>
        </AppFrame>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </AppServicesProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppBootstrap />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  errorTitle: {
    color: colors.text,
    textAlign: 'center',
  },
  errorCause: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    minWidth: 160,
    minHeight: 48,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: colors.white,
    textAlign: 'center',
  },
});
