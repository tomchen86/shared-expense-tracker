import { StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { useGroup } from './use-group';

export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const [group] = useGroup(id);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: group?.name ?? 'Group Details' }} />
      {group && (
        <HeaderActions
          menu={{
            label: 'Group actions',
            actions: [
              {
                label: 'Members',
                onPress: () =>
                  router.navigate({
                    pathname: '/groups/members',
                    params: { id },
                  }),
              },
              {
                label: 'Rename Group',
                onPress: () =>
                  router.navigate({
                    pathname: '/groups/rename',
                    params: { id },
                  }),
              },
            ],
          }}
        />
      )}
      {group !== undefined && (
        <Text style={[styles.message, { color: colors.textMuted }]}>
          {group ? 'No expenses in this group yet.' : 'Group not found.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  message: { padding: 20, marginTop: 48, textAlign: 'center', fontSize: 16 },
});
