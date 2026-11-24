import { useState, useSyncExternalStore } from 'react';
import { Keyboard, StatusBar, StyleSheet } from 'react-native';
import {
  BasicAlertDialog,
  Column,
  FlowRow,
  Spacer,
  Surface,
  Text,
  TextButton,
  TextField,
} from '@expo/ui/jetpack-compose';
import {
  align,
  clip,
  clickable,
  fillMaxWidth,
  height,
  onSizeChanged,
  padding,
  paddingAll,
  semantics,
  Shapes,
} from '@expo/ui/jetpack-compose/modifiers';
import {
  MaterialHost,
  MaterialLabel,
  useTextWithCaretAtEnd,
} from './material.android';

function subscribeToKeyboard(onChange: () => void) {
  const shown = Keyboard.addListener('keyboardDidShow', onChange);
  const hidden = Keyboard.addListener('keyboardDidHide', onChange);
  return () => {
    shown.remove();
    hidden.remove();
  };
}

const keyboardTop = () => Keyboard.metrics()?.screenY;

export function useFilterNamePrompt(onSave: (name: string) => void) {
  const [suggestion, setSuggestion] = useState<string>();
  const close = () => setSuggestion(undefined);
  return {
    prompt: setSuggestion,
    dialog: suggestion !== undefined && (
      <FilterNameDialog
        suggestion={suggestion}
        onClose={close}
        onSave={(name) => {
          close();
          onSave(name);
        }}
      />
    ),
  };
}

function FilterNameDialog({
  suggestion,
  onClose,
  onSave,
}: {
  suggestion: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const field = useTextWithCaretAtEnd(suggestion);
  const [canSave, setCanSave] = useState(!!suggestion.trim());
  const keyboardY = useSyncExternalStore(subscribeToKeyboard, keyboardTop);
  const [dialogHeight, setDialogHeight] = useState(0);
  // Only reserve space around a full-height surface. In a shorter window Android pans
  // to the focused field, and Back reveals the buttons.
  const spareHeight =
    (keyboardY ?? 0) - (StatusBar.currentHeight ?? 0) - dialogHeight;
  const gap = dialogHeight > 0 ? Math.max(0, spareHeight / 2) : 0;
  function save() {
    const name = field.value.get();
    if (name.trim()) onSave(name);
  }
  return (
    <MaterialHost style={StyleSheet.absoluteFill} pointerEvents="none">
      <BasicAlertDialog onDismissRequest={onClose}>
        <Column>
          <Spacer
            modifiers={[
              fillMaxWidth(),
              height(gap),
              ...(gap > 0
                ? [
                    clickable(onClose, { indication: false }),
                    semantics({ contentDescription: 'Close' }),
                  ]
                : []),
            ]}
          />
          <Surface
            modifiers={[
              clip(Shapes.RoundedCorner(28)),
              onSizeChanged(({ height }) => setDialogHeight(height)),
            ]}
          >
            <Column modifiers={[paddingAll(24)]}>
              <Text
                style={{ typography: 'headlineSmall' }}
                modifiers={[padding(0, 0, 0, 16)]}
              >
                Save Filter
              </Text>
              <TextField
                {...field}
                autoFocus
                singleLine
                onValueChange={(text) => setCanSave(!!text.trim())}
                modifiers={[
                  fillMaxWidth(),
                  semantics({ contentDescription: 'Filter name' }),
                ]}
              >
                <TextField.Label>
                  <Text>Filter name</Text>
                </TextField.Label>
              </TextField>
              <FlowRow
                modifiers={[align('end'), padding(0, 24, 0, 0)]}
                horizontalArrangement={{ spacedBy: 8 }}
                verticalArrangement={{ spacedBy: 12 }}
              >
                <TextButton onClick={onClose}>
                  <Text style={{ typography: 'labelLarge' }}>Cancel</Text>
                </TextButton>
                <TextButton
                  enabled={canSave}
                  onClick={save}
                  modifiers={[semantics({ contentDescription: 'Save' })]}
                >
                  {canSave ? (
                    <Text style={{ typography: 'labelLarge' }}>Save</Text>
                  ) : (
                    // Expose the disabled state on the named text, as well as on the button.
                    <MaterialLabel
                      accessibilityRole="button"
                      accessibilityState={{ disabled: true }}
                      color="onSurface"
                    >
                      Save
                    </MaterialLabel>
                  )}
                </TextButton>
              </FlowRow>
            </Column>
          </Surface>
          <Spacer modifiers={[height(gap)]} />
        </Column>
      </BasicAlertDialog>
    </MaterialHost>
  );
}
