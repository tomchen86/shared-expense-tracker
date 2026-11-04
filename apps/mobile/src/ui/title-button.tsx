import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useThemeColors } from './theme';

export function TitleButton({
  title,
  hint,
  onPress,
}: {
  title: string;
  hint: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      onPress={onPress}
      android_ripple={{ color: colors.pressedSurface }}
      style={styles.button}
    >
      <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
        {title}
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <SymbolView
          name={{ ios: 'chevron.down', android: 'expand_more' }}
          size={16}
          tintColor={colors.text}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1, fontSize: 17, fontWeight: '600' },
});
