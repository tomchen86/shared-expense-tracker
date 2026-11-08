import { useRef, type ComponentRef, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { HeaderAction } from './header-actions';
import { useThemeColors } from './theme';
import { useKeyboardInset } from './use-keyboard-inset';

export interface SheetProps {
  visible: boolean;
  title: string;
  cancel?: HeaderAction;
  confirm?: HeaderAction;
  onClose: () => void;
  dismissible?: boolean;
  children: ReactNode;
}

export function Sheet({
  visible,
  title,
  cancel,
  confirm,
  onClose,
  dismissible = true,
  children,
}: SheetProps) {
  const colors = useThemeColors();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const keyboardInset = useKeyboardInset(scroll);
  function action(item: HeaderAction | undefined) {
    return item ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ disabled: !!item.disabled }}
        disabled={item.disabled}
        onPress={item.onPress}
        style={styles.button}
      >
        <Text
          style={{
            color: item.disabled ? colors.textMuted : colors.accent,
            fontSize: 17,
          }}
        >
          {item.label}
        </Text>
      </Pressable>
    ) : (
      <View style={styles.button} />
    );
  }
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        if (dismissible) onClose();
      }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.header}>
          {action(cancel)}
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: colors.text }]}
          >
            {title}
          </Text>
          {action(confirm)}
        </View>
        <ScrollView
          ref={scroll}
          style={keyboardInset}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  button: {
    minWidth: 64,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 20 },
});
