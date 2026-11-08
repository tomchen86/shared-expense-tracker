import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSurface } from './glass-surface';
import { useThemeColors } from './theme';

/** A capsule above the + button and the tab bar: a message, with a button when `action` is given. */
export function BottomNotice({
  message,
  action,
}: {
  message: string;
  action?: { label: string; accessibilityLabel: string; onPress: () => void };
}) {
  const colors = useThemeColors();
  const { bottom } = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.overlay, { bottom: bottom + 172 }]}
    >
      <GlassSurface
        style={styles.notice}
        opaqueStyle={[styles.opaque, { borderColor: colors.separator }]}
      >
        <Text
          style={[
            styles.message,
            { color: colors.text },
            !action && styles.messageOnly,
          ]}
        >
          {message}
        </Text>
        {action && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            onPress={action.onPress}
            style={styles.action}
          >
            <Text style={[styles.actionLabel, { color: colors.accent }]}>
              {action.label}
            </Text>
          </Pressable>
        )}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  // Reserve room for the tab bar and the 60-point Add button with its margins.
  overlay: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 20,
    paddingRight: 4,
    borderRadius: 24,
    overflow: 'hidden',
  },
  opaque: { borderWidth: StyleSheet.hairlineWidth },
  message: { flexShrink: 1, fontSize: 17, paddingVertical: 12 },
  messageOnly: { paddingRight: 16 },
  action: {
    minHeight: 48,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  actionLabel: { fontSize: 17, fontWeight: '600' },
});
