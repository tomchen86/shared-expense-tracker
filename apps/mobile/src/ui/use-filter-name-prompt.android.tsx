import { useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  AlertDialog,
  Text,
  TextButton,
  TextField,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics } from '@expo/ui/jetpack-compose/modifiers';
import {
  MaterialHost,
  MaterialLabel,
  useTextWithCaretAtEnd,
} from './material.android';

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
  const [name, setName] = useState(suggestion);
  const canSave = !!name.trim();
  return (
    <MaterialHost style={StyleSheet.absoluteFill} pointerEvents="none">
      <AlertDialog onDismissRequest={onClose}>
        <AlertDialog.Title>
          <Text style={{ typography: 'headlineSmall' }}>Save Filter</Text>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <TextField
            {...field}
            autoFocus
            singleLine
            onValueChange={setName}
            modifiers={[
              fillMaxWidth(),
              semantics({ contentDescription: 'Filter name' }),
            ]}
          >
            <TextField.Label>
              <Text>Filter name</Text>
            </TextField.Label>
          </TextField>
        </AlertDialog.Text>
        <AlertDialog.DismissButton>
          <TextButton onClick={onClose}>
            <Text style={{ typography: 'labelLarge' }}>Cancel</Text>
          </TextButton>
        </AlertDialog.DismissButton>
        <AlertDialog.ConfirmButton>
          <TextButton
            enabled={canSave}
            onClick={() => onSave(name)}
            modifiers={[semantics({ contentDescription: 'Save' })]}
          >
            <MaterialLabel
              accessibilityState={{ disabled: !canSave }}
              color={canSave ? 'primary' : 'onSurface'}
            >
              Save
            </MaterialLabel>
          </TextButton>
        </AlertDialog.ConfirmButton>
      </AlertDialog>
    </MaterialHost>
  );
}
