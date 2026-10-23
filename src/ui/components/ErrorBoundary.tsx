import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { TapTarget } from './TapTarget';
import { uk } from '../../i18n/uk';
import { colors, spacing } from '../theme';

export interface ErrorBoundaryProps {
  children: ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // INV-01: Offline-only, do not report errors to any network endpoint or external service
  }

  handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <AppText variant="title" accessibilityRole="header" style={styles.title}>
            {uk.errorBoundary.title}
          </AppText>
          <TapTarget
            accessibilityRole="button"
            accessibilityLabel={uk.errorBoundary.retry}
            onPress={this.handleRetry}
            style={styles.retryButton}
          >
            <AppText variant="body" style={styles.retryText}>
              {uk.errorBoundary.retry}
            </AppText>
          </TapTarget>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    color: colors.text,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 16,
    minWidth: 160,
  },
  retryText: {
    color: colors.white,
    textAlign: 'center',
  },
});
