import { Stack } from 'expo-router';
import { formScreenOptions } from '../../src/ui/form-presentation';

export default function ExpenseFormLayout() {
  return (
    <Stack screenOptions={formScreenOptions}>
      <Stack.Screen name="new" options={{ title: 'New Expense' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Edit Expense' }} />
    </Stack>
  );
}
