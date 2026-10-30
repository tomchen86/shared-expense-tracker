import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useLocalDatabase } from '../shell';
import { useThemeColors } from '../ui/theme';
import { listGroups } from './index';

export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const database = useLocalDatabase();
  const colors = useThemeColors();
  const [name, setName] = useState('');
  useEffect(() => {
    let active = true;
    void listGroups(database)
      .then((groups) => {
        if (active)
          setName(groups.find((group) => group.id === id)?.name ?? '');
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [database, id]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: name }} />
    </View>
  );
}
