import {
  fireEvent,
  isHiddenFromAccessibility,
  render,
  screen,
} from '@testing-library/react-native';
import { InviteAction } from '../../src/ui/invite-action';

test('the inline retry label is itself the named button that handles the press', async () => {
  const onPress = jest.fn();
  await render(<InviteAction label="Try Again" inline onPress={onPress} />);
  const retry = screen.getByRole('button', { name: 'Try Again' });
  expect(screen.getByText('Try Again')).toBe(retry);
  await fireEvent.press(retry);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test.each(['Share Link', 'Revoke Link', 'Try Again'])(
  '%s exposes one focusable button and handles a press once',
  async (label) => {
    const onPress = jest.fn();
    await render(
      <InviteAction
        label={label}
        destructive={label === 'Revoke Link'}
        onPress={onPress}
      />,
    );
    const button = screen.getByRole('button', { name: label });
    expect(screen.getByLabelText(label)).toBe(button);
    expect(button).toHaveProp('focusable', true);
    const labels = button.queryAll((node) => node.props.text === label);
    expect(labels).toHaveLength(1);
    expect(isHiddenFromAccessibility(labels[0])).toBe(true);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    await fireEvent(labels[0], 'buttonPressed');
    expect(onPress).toHaveBeenCalledTimes(2);
  },
);
