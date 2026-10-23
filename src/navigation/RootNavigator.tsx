import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './routes';
import { TodayScreen } from '../screens/TodayScreen';
import { TimerScreen } from '../screens/TimerScreen';
import { AppText } from '../ui/components/AppText';
import { uk } from '../i18n/uk';
import { colors } from '../ui/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

function PinGateStubScreen() {
  return (
    <View style={styles.stubContainer}>
      <AppText variant="title">{uk.stub.soon}</AppText>
    </View>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Today"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Today" component={TodayScreen} />
      <Stack.Screen name="Timer" component={TimerScreen} />
      <Stack.Screen name="PinGate" component={PinGateStubScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  stubContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
