import { Stack } from 'expo-router';

export default function ExpensesLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: 'Expenses', headerLargeTitleEnabled: true }}
      />
    </Stack>
  );
}
