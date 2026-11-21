import { Alert } from 'react-native';

export function useFilterNamePrompt(onSave: (name: string) => void) {
  return {
    prompt: (suggested: string) =>
      Alert.prompt(
        'Save Filter',
        'Name this filter to use it again later.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: (name?: string) => onSave(name ?? '') },
        ],
        'plain-text',
        suggested,
      ),
    dialog: null,
  };
}
