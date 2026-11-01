import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { formPresentation } from '../src/ui/form-presentation';
import { PhoneLocalData } from '../src/shell/phone-local-data';

function ThemedStack() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="expenses/new"
          options={{ ...formPresentation, title: 'New Expense' }}
        />
        <Stack.Screen
          name="expenses/[id]/edit"
          options={{ ...formPresentation, title: 'Edit Expense' }}
        />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <PhoneLocalData>
      <ThemedStack />
    </PhoneLocalData>
  );
}
