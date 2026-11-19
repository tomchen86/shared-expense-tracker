import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { InviteLinkSheet } from '../src/sharing/invite-link-sheet';
import { formPresentation } from '../src/ui/form-presentation';
import { nativeStatusBarStyle } from '../src/ui/appearance';
import { PhoneLocalData } from '../src/shell/phone-local-data';
import { TrashProvider } from '../src/ledger/trash-provider';
import { ReadError } from '../src/shell/read-error';

export const unstable_settings = { screenErrorBoundary: ReadError };

function ThemedStack() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <InviteLinkSheet>
        <Stack
          screenOptions={{
            headerShown: false,
            statusBarStyle: nativeStatusBarStyle(scheme),
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
      </InviteLinkSheet>
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
