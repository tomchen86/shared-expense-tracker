import { Button, TextInput } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useFilterNamePrompt } from '../../src/ui/use-filter-name-prompt';

const suggestion = 'Shopping, Paid by Me';

function Prompt() {
  const { prompt, sheet } = useFilterNamePrompt(() => undefined);
  return (
    <>
      <Button title="Name filter" onPress={() => prompt(suggestion)} />
      {sheet}
    </>
  );
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('requests focus after the modal shows and places the caret at the end only on opening', async () => {
  jest.useFakeTimers();
  const focus = jest.spyOn(TextInput.prototype, 'focus');
  // React Native's Jest field supplies focus and blur. Record its native selection command too.
  const selection = jest.fn();
  TextInput.prototype.setSelection = selection;
  await render(<Prompt />);
  await fireEvent.press(screen.getByRole('button', { name: /name filter/i }));
  const input = screen.getByLabelText('Filter name');
  expect(input.props.value).toBe(suggestion);
  await act(jest.advanceTimersToNextFrame);
  expect(focus).not.toHaveBeenCalled();

  const [modal] = screen.container.queryAll((view) => view.type === 'Modal');
  await fireEvent(modal, 'show');
  await act(jest.advanceTimersToNextFrame);
  expect(focus).toHaveBeenCalledTimes(1);
  expect(selection).toHaveBeenCalledWith(suggestion.length, suggestion.length);

  await fireEvent.changeText(input, 'Custom name');
  await act(jest.advanceTimersToNextFrame);
  expect(focus).toHaveBeenCalledTimes(1);
  expect(selection).toHaveBeenCalledTimes(1);
});
