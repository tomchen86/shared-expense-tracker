import { Stack } from 'expo-router';

export const unstable_settings = { initialRouteName: 'index' };

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
      <Stack.Screen
        name="new"
        options={{
          title: 'New Group',
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );
}
