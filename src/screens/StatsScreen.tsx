import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import { AppText } from '../ui/components/AppText';
import { TapTarget } from '../ui/components/TapTarget';
import { ParentGuard } from '../navigation/ParentGuard';
import { uk } from '../i18n/uk';
import { colors, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Stats'>;

export function StatsScreen({ navigation }: Props) {
  return (
    <ParentGuard navigation={navigation}>
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

          <AppText variant="title" style={styles.title}>
            {uk.parentHome.stats}
          </AppText>
        </View>

        <View style={styles.content}>
          <AppText variant="body" style={styles.placeholderText}>
            {uk.stub.soon}
          </AppText>
        </View>
      </View>
    </ParentGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  backButton: {
    padding: spacing.sm,
  },
  backButtonText: {
    color: colors.primary,
  },
  title: {
    color: colors.text,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: colors.textSecondary,
  },
});
