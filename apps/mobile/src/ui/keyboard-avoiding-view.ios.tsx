import type { ViewProps } from 'react-native';

// Native form sheets need the ScrollView directly beneath their content wrapper
// to measure fitToContents. Its automatic keyboard insets handle avoidance.
export function KeyboardAvoidingView({ children }: ViewProps) {
  return <>{children}</>;
}
