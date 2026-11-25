import { Button, DeviceEventEmitter, StatusBar, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  BasicAlertDialog,
  RNHostView,
  Spacer,
  Surface,
  Text,
  TextButton,
  TextField,
  type TextFieldProps,
} from '@expo/ui/jetpack-compose';
import { height } from '@expo/ui/jetpack-compose/modifiers';
import { useFilterNamePrompt } from '../../src/ui/use-filter-name-prompt';
import { componentsIn } from '../acceptance/shell-tabs-app';

const suggestion = 'Shopping, Paid by Me';

const components = (component: unknown) =>
  componentsIn(screen.getByTestId('prompt'), (type) => type === component);

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
  await fireEvent.press(screen.getByText('Save'));
  expect(save).not.toHaveBeenCalled();
  await fireEvent(components(BasicAlertDialog)[0].view!, 'dismissRequest');
  expect(save).not.toHaveBeenCalled();
  await open();
  expect(field().value?.value).toBe(suggestion);
  expect(field().selection?.value).toEqual(end);
  field().value!.set('Min');
  await fireEvent(components(TextField)[0].view!, 'valueChange', {
    nativeEvent: { text: 'Min' },
  });
  // The last edit may reach Compose just before the press reaches JS.
  field().value!.set('Mine');
  const saveLabel = components(Text).find(
    (text) => text.props.children === 'Save',
  );
  await fireEvent(saveLabel!.view!, 'buttonPressed');
  expect(save).toHaveBeenCalledWith('Mine');
  expect(screen.queryByText('Save Filter')).toBeNull();
});

test('splits spare height between the gaps only while the keyboard is open and the dialog fits', async () => {
  await render(<Prompt onSave={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: /name filter/i }));
  const measureDialog = (surfaceHeight: number) =>
    fireEvent(components(Surface)[0].view!, 'globalEvent', {
      nativeEvent: {
        payload: ['onSizeChanged', { width: 320, height: surfaceHeight }],
      },
    });
  const expectGaps = (size: number) => {
    for (const component of [RNHostView, Spacer]) {
      expect(components(component)[0].props.modifiers).toContainEqual(
        height(size),
      );
    }
  };

  await act(async () => {
    DeviceEventEmitter.emit('keyboardDidShow', {
      endCoordinates: { screenY: (StatusBar.currentHeight ?? 0) + 300 },
    });
  });
  await measureDialog(320);
  expectGaps(0);
  await measureDialog(220);
  expectGaps(40);
  await act(async () => {
    DeviceEventEmitter.emit('keyboardDidHide');
  });
  expectGaps(0);
});
