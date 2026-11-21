import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useThemeColors } from './theme';

export interface CapsuleProps {
  label: string;
  value: string;
  /** The words on the face when they differ from the accessible value. */
  text?: string;
  selected?: boolean;
}

export const capsuleName = ({
  label,
  value,
}: Pick<CapsuleProps, 'label' | 'value'>) =>
  value ? `${label}, ${value}` : label;

export function CapsuleFace({ label, value, text, selected }: CapsuleProps) {
  const colors = useThemeColors();
  const on = selected ?? Boolean(value);
  const ink = on ? '#fff' : colors.text;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.face,
        { backgroundColor: on ? colors.accent : colors.segmentedTrack },
      ]}
    >
      <Text numberOfLines={1} style={[styles.text, { color: ink }]}>
        {text || value || label}
      </Text>
      {selected === undefined && (
        <SymbolView
          name={{ ios: 'chevron.down', android: 'expand_more' }}
          size={11}
          weight="semibold"
          tintColor={ink}
        />
      )}
    </View>
  );
}

export function CapsuleButton({
  onPress,
  ...props
}: CapsuleProps & { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={capsuleName(props)}
      accessibilityState={{ selected: props.selected }}
      onPress={onPress}
      style={styles.button}
    >
      <CapsuleFace {...props} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { justifyContent: 'center', minHeight: 44 },
  face: {
    minHeight: 32,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  text: { fontSize: 14, fontWeight: '600' },
});
