import { Stack } from 'expo-router';

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
      <Stack.Screen
        name="manage-categories"
        options={{ title: 'Manage Categories' }}
      />
    </Stack>
  );
}
