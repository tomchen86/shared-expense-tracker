import { Stack } from 'expo-router';
import { formPresentation } from '../../../src/ui/form-presentation';

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
      <Stack.Screen
        name="members"
        options={{ ...formPresentation, title: 'Members' }}
      />
      <Stack.Screen
        name="add-member"
        options={{ ...formPresentation, title: 'Add Member' }}
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
