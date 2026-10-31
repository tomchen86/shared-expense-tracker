import { View } from 'react-native';
import { router } from 'expo-router';
import { AddButton } from '../ui/add-button';
import { useThemeColors } from '../ui/theme';

export function ExpensesScreen() {
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AddButton onPress={() => router.navigate('/expenses/new')} />
    </View>
  );
}
