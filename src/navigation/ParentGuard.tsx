import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from './routes';
import { useServices } from '../state/appServices';
import { useParentSessionStore, parentSessionStore } from '../state/parentSessionStore';

export interface ParentGuardProps {
  children: React.ReactNode;
  navigation?: NativeStackNavigationProp<RootStackParamList, any>;
}

export function ParentGuard({ children, navigation: propNavigation }: ParentGuardProps) {
  const { clock } = useServices();
  const hookNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const navigation = propNavigation ?? hookNavigation;

  const isSessionActive = useParentSessionStore((s) => s.isSessionActive);
  const isActiveFn = useParentSessionStore((s) => s.isActive);
  const exit = useParentSessionStore((s) => s.exit);

  const active = isActiveFn(clock.now());

  useEffect(() => {
    if (!active) {
      if (typeof navigation?.replace === 'function') {
        navigation.replace('PinGate', { intent: 'enterParent' });
      }
      return;
    }

    const interval = setInterval(() => {
      if (!parentSessionStore.isActive(clock.now())) {
        if (typeof navigation?.replace === 'function') {
          navigation.replace('PinGate', { intent: 'enterParent' });
        }
      }
    }, 1000);

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        exit();
        if (typeof navigation?.replace === 'function') {
          navigation.replace('PinGate', { intent: 'enterParent' });
        }
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [active, clock, navigation, exit]);

  if (!active) {
    return null;
  }

  return <>{children}</>;
}
