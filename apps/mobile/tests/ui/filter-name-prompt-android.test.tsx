import { Button, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  AlertDialog,
  TextButton,
  TextField,
  type TextFieldProps,
} from '@expo/ui/jetpack-compose';
import { useFilterNamePrompt } from '../../src/ui/use-filter-name-prompt';
import { componentsIn } from '../acceptance/shell-tabs-app';

const suggestion = 'Shopping, Paid by Me';

function Prompt({ onSave }: { onSave: (name: string) => void }) {
  const { prompt, dialog } = useFilterNamePrompt(onSave);
  return (
    <View testID="prompt">
      <Button title="Name filter" onPress={() => prompt(suggestion)} />
      {dialog}
    </View>
  );
}

test('focuses the suggested name at its end on each opening and preserves a moved caret while editing', async () => {
  const save = jest.fn();
  await render(<Prompt onSave={save} />);
  const open = () =>
    fireEvent.press(screen.getByRole('button', { name: /name filter/i }));
  const components = (component: unknown) =>
    componentsIn(screen.getByTestId('prompt'), (type) => type === component);
  const field = () => components(TextField)[0].props as TextFieldProps;
  await open();
  const initial = field();
  expect(initial.autoFocus).toBe(true);
  expect(initial.value?.value).toBe(suggestion);
  const end = { start: suggestion.length, end: suggestion.length };
  expect(initial.selection?.value).toEqual(end);

  // Compose writes the edit and the caret before notifying JavaScript.
  initial.selection!.set({ start: 1, end: 1 });
  initial.value!.set(' ');
  await fireEvent(components(TextField)[0].view!, 'valueChange', {
    nativeEvent: { text: ' ' },
  });
  expect(field().selection?.value).toEqual({ start: 1, end: 1 });
  expect(
    components(TextButton).map((button) => button.view?.props.enabled),
  ).toEqual([true, false]);
  expect(screen.getByText('Save')).toBeDisabled();
  await fireEvent(components(AlertDialog)[0].view!, 'dismissRequest');
  expect(save).not.toHaveBeenCalled();
  await open();
  expect(field().value?.value).toBe(suggestion);
  expect(field().selection?.value).toEqual(end);
  await fireEvent(components(TextField)[0].view!, 'valueChange', {
    nativeEvent: { text: 'Mine' },
  });
  await fireEvent(screen.getByText('Save'), 'buttonPressed');
  expect(save).toHaveBeenCalledWith('Mine');
});
