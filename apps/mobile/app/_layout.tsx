import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { formPresentation } from '../src/ui/form-presentation';
import { PhoneLocalData } from '../src/shell/phone-local-data';
import { TrashProvider } from '../src/ledger/trash-provider';
import { ReadError } from '../src/shell/read-error';

export const unstable_settings = { screenErrorBoundary: ReadError };

function ThemedStack() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          statusBarStyle: scheme === 'dark' ? 'light' : 'dark',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="expenses/new"
          options={{ ...formPresentation, title: 'New Expense' }}
        />
        <Stack.Screen
          name="expenses/[id]/edit"
          options={{ ...formPresentation, title: 'Edit Expense' }}
        />
        <Stack.Screen
          name="manage-categories"
          options={{ ...formPresentation, title: 'Manage Categories' }}
        />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <PhoneLocalData>
      <TrashProvider>
        <ThemedStack />
      </TrashProvider>
    </PhoneLocalData>
  );
}
