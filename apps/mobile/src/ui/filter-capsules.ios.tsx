import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Button,
  Host,
  HStack,
  Popover,
  Rectangle,
  Text,
  TextField,
  useNativeState,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  foregroundStyle,
  frame,
  keyboardType,
  multilineTextAlignment,
  padding,
  textFieldStyle,
} from '@expo/ui/swift-ui/modifiers';
import { CapsuleFace, capsuleName } from './capsule';
import type { AmountCapsuleProps, CapsuleMenuProps } from './filter-capsules';
import { MenuOverlay } from './menu-field.ios';
import { usePopoverBackdrop } from './popover-backdrop';

export function CapsuleMenu(props: CapsuleMenuProps) {
  return (
    <View onStartShouldSetResponder={() => true} style={styles.trigger}>
      <CapsuleFace label={props.label} value={props.value} text={props.text} />
      <MenuOverlay
        {...props}
        accessibilityLabel={capsuleName(props)}
        title={props.label}
        fixedOrder
      />
    </View>
  );
}

export function AmountCapsule(props: AmountCapsuleProps) {
  const [open, setOpen] = useState(false);
  const { onPresented } = props;
  const present = useCallback(
    (next: boolean) => {
      setOpen(next);
      onPresented(next);
    },
    [onPresented],
  );
  usePopoverBackdrop(open, present);
  return (
    <View onStartShouldSetResponder={() => true} style={styles.trigger}>
      <CapsuleFace {...props} />
      <Host ignoreSafeArea="all" style={StyleSheet.absoluteFill}>
        <Popover
          isPresented={open}
          onIsPresentedChange={present}
          arrowEdge="top"
        >
          <Popover.Trigger>
            <Button
              onPress={() => present(!open)}
              modifiers={[
                buttonStyle('plain'),
                accessibilityLabel(capsuleName(props)),
              ]}
            >
              <Rectangle
                modifiers={[
                  foregroundStyle('rgba(127,127,127,0.002)'),
                  frame({
                    maxWidth: Number.MAX_SAFE_INTEGER,
                    maxHeight: Number.MAX_SAFE_INTEGER,
                  }),
                ]}
              />
            </Button>
          </Popover.Trigger>
          <Popover.Content>
            {open && <AmountFields {...props} />}
          </Popover.Content>
        </Popover>
      </Host>
    </View>
  );
}

function AmountFields({ min, max, onAmount }: AmountCapsuleProps) {
  const lowest = useNativeState(min);
  const highest = useNativeState(max);
  const field = [
    keyboardType('decimal-pad'),
    textFieldStyle('roundedBorder'),
    multilineTextAlignment('center'),
    frame({ width: 100 }),
  ];
  return (
    <HStack spacing={8} modifiers={[padding({ all: 16 })]}>
      <TextField
        autoFocus
        text={lowest}
        placeholder="Min"
        onTextChange={(text) => onAmount('min', text)}
        modifiers={[...field, accessibilityLabel('Lowest amount')]}
      />
      <Text>–</Text>
      <TextField
        text={highest}
        placeholder="Max"
        onTextChange={(text) => onAmount('max', text)}
        modifiers={[...field, accessibilityLabel('Highest amount')]}
      />
    </HStack>
  );
}

const styles = StyleSheet.create({
  trigger: { justifyContent: 'center', minHeight: 44 },
});
