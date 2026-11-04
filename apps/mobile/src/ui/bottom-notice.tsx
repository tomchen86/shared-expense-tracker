import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from './theme';

export function BottomNotice({
  message,
  action,
  accessibilityLabel,
  onPress,
}: {
  message: string;
  action: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const { bottom } = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.overlay, { bottom: bottom + 172 }]}
    >
      <View
        style={[
          styles.notice,
          { backgroundColor: colors.surface, borderColor: colors.separator },
        ]}
      >
        <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
        <Text style={{ color: colors.textMuted }}>·</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={styles.action}
        >
          <Text style={{ color: colors.accent, fontSize: 17 }}>{action}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Reserve room for the tab bar and the 60-point Add button with its margins.
  overlay: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 4,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  message: { flexShrink: 1, fontSize: 17, paddingVertical: 12 },
  action: {
    minHeight: 48,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
});
