import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { AppText } from '../ui/components/AppText';
import { PinPad } from '../ui/components/PinPad';
import { uk } from '../i18n/uk';
import { colors, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PinSetup'>;

export function PinSetupScreen({ navigation }: Props) {
  const { authService } = useServices();

  const [step, setStep] = useState<1 | 2>(1);
  const [firstPin, setFirstPin] = useState('');
  const [pinValue, setPinValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleComplete = async (completedPin: string) => {
    if (step === 1) {
      setFirstPin(completedPin);
      setPinValue('');
      setError(null);
      setStep(2);
    } else {
      if (completedPin === firstPin) {
        setError(null);
        const ok = await authService.setupPin(completedPin);
        if (ok) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Today' }],
          });
        }
      } else {
        setError(uk.pin.mismatch);
        setFirstPin('');
        setPinValue('');
        setStep(1);
      }
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header" style={styles.title}>
          {uk.pin.setupTitle}
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          {step === 1 ? uk.pin.setupStep1 : uk.pin.setupStep2}
        </AppText>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <AppText variant="body" style={styles.errorText}>
            {error}
          </AppText>
        </View>
      ) : null}

      <PinPad
        value={pinValue}
        onChange={setPinValue}
        onComplete={handleComplete}
      />

      <View style={styles.noticeBox}>
        <AppText variant="body" style={styles.noticeText}>
          {uk.pin.noRecoveryNotice}
        </AppText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.xl,
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
  errorContainer: {
    backgroundColor: '#FEE2E2',
    padding: spacing.md,
    borderRadius: 8,
    marginVertical: spacing.md,
    maxWidth: 400,
  },
  errorText: {
    color: colors.abandoned,
    textAlign: 'center',
  },
  noticeBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
    marginTop: spacing.xl,
    maxWidth: 480,
  },
  noticeText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
