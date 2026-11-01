import { View } from 'react-native';
import { useThemeColors } from '../ui/theme';

export function HomeScreen() {
  const colors = useThemeColors();
  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}
