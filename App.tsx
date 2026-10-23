import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { openExpoDb } from './src/services/db/expoDb';
import { migrate } from './src/services/db/migrations';
import { seedIfEmpty } from './src/services/db/seed';
import { systemMonotonicClock } from './src/services/clock/monotonic';
import { systemWallClock } from './src/services/clock/wallClock';
import { AppServices, createAppServices, AppServicesProvider } from './src/state/appServices';
import { timerStore } from './src/state/timerStore';
import { tasksStore } from './src/state/tasksStore';
import { parentSessionStore } from './src/state/parentSessionStore';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppText } from './src/ui/components/AppText';
import { uk } from './src/i18n/uk';
import { colors } from './src/ui/theme';

export default function App() {
  const [services, setServices] = useState<AppServices | null>(null);

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

        if (mounted) {
          setServices(svc);
        }
      } catch (err) {
        console.error('Failed to initialize app', err);
      }
    }
    void init();
    return () => {
      mounted = false;
    };
  }, []);

  if (!services) {
    return (
      <View style={styles.loadingContainer}>
        <AppText variant="title">{uk.loading}</AppText>
      </View>
    );
  }

  return (
    <AppServicesProvider services={services}>
      <SafeAreaProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </AppServicesProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
