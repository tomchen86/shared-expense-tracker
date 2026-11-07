import { fireEvent, render, screen } from '@testing-library/react-native';
import { DateField } from '../../src/ui/date-field';

// iOS passes the press that closes the compact date picker's calendar on to the
// form, so the form has to know when a press opened it (date-field.ios.tsx).

const WIDTH = 300;

async function pressedAt(locationX: number, disabled = false) {
  const onOpen = jest.fn();
  await render(
    <DateField
      label="Date"
      value="2026-11-06"
      maximumDate="2026-11-06"
      disabled={disabled}
      onChange={() => {}}
      onOpen={onOpen}
    />,
  );
  await fireEvent(screen.root!, 'layout', {
    nativeEvent: { layout: { width: WIDTH } },
  });
  await fireEvent(screen.root!, 'touchEnd', { nativeEvent: { locationX } });
  return onOpen;
}

test('a press on the date reports that the calendar opened', async () => {
  expect(await pressedAt(WIDTH - 40)).toHaveBeenCalledTimes(1);
});

test('a press on the label does not', async () => {
  expect(await pressedAt(40)).not.toHaveBeenCalled();
});

test('a press on a disabled field does not', async () => {
  expect(await pressedAt(WIDTH - 40, true)).not.toHaveBeenCalled();
});
