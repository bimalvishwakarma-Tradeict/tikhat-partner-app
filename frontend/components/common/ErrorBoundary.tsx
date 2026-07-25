import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { lightColors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

export type ErrorBoundaryProps = {
  children: ReactNode;
  /** Optional custom fallback; defaults to in-app error screen */
  fallback?: ReactNode;
  onReset?: () => void;
  testID?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string | null;
};

/**
 * Catches React render errors and shows a retry screen.
 * Class component required by React error boundary API.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected error',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Avoid console.log — keep silent in production UI; boundary is the UX.
    void error;
    void info;
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <View
        testID={this.props.testID || 'error-boundary'}
        style={[
          styles.root,
          { backgroundColor: lightColors.background, padding: spacing.lg },
        ]}
      >
        <Text
          style={[
            typography.h2,
            { color: lightColors.text.primary, textAlign: 'center' },
          ]}
        >
          Something went wrong
        </Text>
        <Text
          style={[
            typography.body,
            {
              color: lightColors.text.secondary,
              textAlign: 'center',
              marginTop: spacing.sm,
            },
          ]}
        >
          An unexpected error occurred. You can try again without losing your
          place.
        </Text>
        <Pressable
          onPress={this.handleRetry}
          accessibilityRole="button"
          style={[
            styles.retry,
            {
              backgroundColor: lightColors.secondary,
              marginTop: spacing.lg,
            },
          ]}
        >
          <Text
            style={[
              typography.button,
              { color: lightColors.primary, textAlign: 'center' },
            ]}
          >
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retry: {
    minWidth: 160,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});
