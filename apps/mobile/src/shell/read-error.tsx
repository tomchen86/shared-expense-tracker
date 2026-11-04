import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, type ErrorBoundaryProps } from 'expo-router';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { useTabRootBack } from '../ui/use-tab-root-back';

/** Shown in place of a screen that could not read the local data (SHELL-60.1). */
export function ReadError({
  retry,
  cancel,
  title,
}: ErrorBoundaryProps & { cancel?: string; title?: string }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerTitle: undefined,
          headerLeft: undefined,
          headerRight: undefined,
          ...(title === undefined ? {} : { title }),
        }}
      />
      <HeaderActions
        cancel={
          cancel === undefined
            ? undefined
            : { label: cancel, onPress: () => router.back() }
        }
      />
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.text }]}
      >
        Unable to Load Local Data
      </Text>
      <Text style={[styles.message, { color: colors.textMuted }]}>
        Your data was not changed.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try Again"
        onPress={() => void retry()}
        style={styles.retry}
      >
        <Text style={[styles.message, { color: colors.accent }]}>
          Try Again
        </Text>
      </Pressable>
    </View>
  );
}

/** The read error of a sheet, whose title bar keeps its `cancel` action. */
export const sheetReadError = (cancel: string) =>
  function SheetReadError(props: ErrorBoundaryProps) {
    return <ReadError {...props} cancel={cancel} />;
  };

/** The read error of a tab's root, where Android's back button still leaves for Expenses. */
export function TabRootReadError(props: ErrorBoundaryProps) {
  useTabRootBack('/');
  return <ReadError {...props} />;
}

/** The read error of a group's screen, titled as before the group is read. */
export function GroupReadError(props: ErrorBoundaryProps) {
  return <ReadError {...props} title="Group Details" />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
  },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  message: { fontSize: 15, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
});
