import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { useServices } from '../state/appServices';
import { AppText } from '../ui/components/AppText';
import { NoticeBox } from '../ui/components/NoticeBox';
import { PinPad } from '../ui/components/PinPad';
import { CONTENT_MAX_WIDTH, useScreenGutter } from '../ui/hooks/useScreenGutter';
import { uk } from '../i18n/uk';
import { colors, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PinSetup'>;

export function PinSetupScreen({ navigation }: Props) {
  const { authService } = useServices();
  const { gutter } = useScreenGutter();

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
    <ScrollView
      contentContainerStyle={[styles.container, { padding: gutter }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* §4.1: centered single column, maxWidth 480, usable at any rotation. */}
      <View style={styles.inner}>
        <View style={styles.header}>
          <AppText variant="title" accessibilityRole="header" style={styles.title}>
            {uk.pin.setupTitle}
          </AppText>
          <AppText variant="body" style={styles.subtitle}>
            {step === 1 ? uk.pin.setupStep1 : uk.pin.setupStep2}
          </AppText>
        </View>

        {error ? <NoticeBox tone="error" message={error} /> : null}

        <PinPad
          value={pinValue}
          onChange={setPinValue}
          onComplete={handleComplete}
        />

        <NoticeBox tone="info" message={uk.pin.noRecoveryNotice} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flexGrow: 1,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH.pin,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
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
});