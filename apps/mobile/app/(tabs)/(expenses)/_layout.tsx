import { Stack } from 'expo-router';

export const unstable_settings = { anchor: 'index' };

export default function ExpensesLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Expenses', headerLargeTitleEnabled: true }}
      />
      <Stack.Screen name="expenses/[id]" options={{ title: 'Expense' }} />
      <Stack.Screen
        name="insights"
        options={{ title: 'Insights', fullScreenGestureEnabled: false }}
      />
    </Stack>
  );
}
