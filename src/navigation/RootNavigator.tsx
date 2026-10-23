import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './routes';
import { TodayScreen } from '../screens/TodayScreen';
import { TimerScreen } from '../screens/TimerScreen';
import { PinSetupScreen } from '../screens/PinSetupScreen';
import { PinGateScreen } from '../screens/PinGateScreen';
import { ParentHomeScreen } from '../screens/ParentHomeScreen';
import { TaskListEditScreen } from '../screens/TaskListEditScreen';
import { TaskEditScreen } from '../screens/TaskEditScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { useServices } from '../state/appServices';
import { AppText } from '../ui/components/AppText';
import { uk } from '../i18n/uk';
import { colors } from '../ui/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export interface RootNavigatorProps {
  initialRouteName?: keyof RootStackParamList;
}

export function RootNavigator({ initialRouteName }: RootNavigatorProps) {
  const { authService } = useServices();
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(
    initialRouteName ?? null
  );

  useEffect(() => {
    if (initialRouteName) return;

    let isMounted = true;
    const res = (authService as any)?.hasPin?.();
    if (typeof res === 'boolean') {
      setInitialRoute(res ? 'Today' : 'PinSetup');
    } else if (res && typeof res.then === 'function') {
      void res
        .then((has: boolean) => {
          if (isMounted) {
            setInitialRoute(has ? 'Today' : 'PinSetup');
          }
        })
        .catch((err: unknown) => {
          console.error('Failed to check pin', err);
          if (isMounted) {
            setInitialRoute('Today');
          }
        });
    } else {
      setInitialRoute('Today');
    }

    return () => {
      isMounted = false;
    };
  }, [authService, initialRouteName]);

  if (!initialRoute) {
    return (
      <View style={styles.loadingContainer}>
        <AppText variant="title">{uk.loading}</AppText>
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="PinSetup" component={PinSetupScreen} />
      <Stack.Screen name="Today" component={TodayScreen} />
      <Stack.Screen name="Timer" component={TimerScreen} />
      <Stack.Screen name="PinGate" component={PinGateScreen} />
      <Stack.Screen name="ParentHome" component={ParentHomeScreen} />
      <Stack.Screen name="TaskListEdit" component={TaskListEditScreen} />
      <Stack.Screen name="TaskEdit" component={TaskEditScreen} />
      <Stack.Screen name="Stats" component={StatsScreen} />
    </Stack.Navigator>
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
