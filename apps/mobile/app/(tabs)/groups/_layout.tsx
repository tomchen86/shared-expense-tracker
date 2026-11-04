import { Stack } from 'expo-router';
import { formPresentation } from '../../../src/ui/form-presentation';

export const unstable_settings = { anchor: 'index' };

export default function GroupsLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Groups', headerLargeTitleEnabled: true }}
      />
      <Stack.Screen name="expenses/[id]" options={{ title: 'Expense' }} />
      <Stack.Screen
        name="new"
        options={{
          title: 'New Group',
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="members"
        options={{ ...formPresentation, title: 'Members' }}
      />
      <Stack.Screen
        name="balances"
        options={{ ...formPresentation, title: 'Balances' }}
      />
      <Stack.Screen
        name="rename-member"
        options={{ ...formPresentation, title: 'Rename Member' }}
      />
      <Stack.Screen
        name="rename"
        options={{ ...formPresentation, title: 'Rename Group' }}
      />
    </Stack>
  );
}
