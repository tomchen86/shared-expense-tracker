import { Stack } from 'expo-router';
import { formPresentation } from '../../../src/ui/form-presentation';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Settings', headerLargeTitleEnabled: true }}
      />
      <Stack.Screen
        name="archived-groups"
        options={{ title: 'Archived Groups' }}
      />
      <Stack.Screen name="trash" options={{ title: 'Trash' }} />
      <Stack.Screen name="trash/[id]" options={{ title: 'Expense' }} />
      <Stack.Screen
        name="manage-categories"
        options={{ title: 'Manage Categories' }}
      />
      <Stack.Screen
        name="archived-groups/[id]"
        options={{ title: 'Group Details' }}
      />
      <Stack.Screen
        name="archived-groups/members"
        options={{ ...formPresentation, title: 'Members' }}
      />
      <Stack.Screen
        name="archived-groups/add-member"
        options={{ ...formPresentation, title: 'Add Member' }}
      />
      <Stack.Screen
        name="archived-groups/rename-member"
        options={{ ...formPresentation, title: 'Rename Member' }}
      />
      <Stack.Screen
        name="archived-groups/rename"
        options={{ ...formPresentation, title: 'Rename Group' }}
      />
    </Stack>
  );
}
