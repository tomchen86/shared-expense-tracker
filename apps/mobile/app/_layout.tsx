import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  router,
  Stack,
  ThemeProvider,
} from 'expo-router';
import { onInviteLink } from '../src/sharing/invite-links';
import { formPresentation } from '../src/ui/form-presentation';
import { nativeStatusBarStyle } from '../src/ui/appearance';
import { PhoneLocalData } from '../src/shell/phone-local-data';
import { TrashProvider } from '../src/ledger/trash-provider';
import { ReadError } from '../src/shell/read-error';

export const unstable_settings = { screenErrorBoundary: ReadError };

function ThemedStack() {
  const scheme = useColorScheme();
  useEffect(
    () =>
      onInviteLink((link) => {
        router.navigate({ pathname: '/i/invite', params: { link } });
      }),
    [],
  );
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          statusBarStyle: nativeStatusBarStyle(scheme),
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="i/invite"
          options={{ ...formPresentation, title: 'Invite Link' }}
        />
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
