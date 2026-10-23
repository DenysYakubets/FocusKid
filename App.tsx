import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { systemWallClock } from './src/services/clock/wallClock';
import { openExpoDb } from './src/services/db/expoDb';
import { migrate } from './src/services/db/migrations';
import { seedIfEmpty } from './src/services/db/seed';
import { AppText } from './src/ui/components/AppText';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const db = await openExpoDb();
        await migrate(db);
        await seedIfEmpty(db, systemWallClock);
        setReady(true);
      } catch (err) {
        console.error('Failed to initialize database', err);
      }
    }
    init();
  }, []);

  return (
    <View style={styles.container}>
      <AppText variant="title">{ready ? 'FocusKid' : 'FocusKid'}</AppText>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
