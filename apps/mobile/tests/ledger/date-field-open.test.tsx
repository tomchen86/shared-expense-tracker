import { fireEvent, render, screen } from '@testing-library/react-native';
import { DateField } from '../../src/ui/date-field';

// iOS passes the press that closes the compact date picker's calendar on to the
// form, so the form has to know when a press opened it (date-field.ios.tsx).

async function pressed(on: 'date' | 'label', disabled = false) {
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
  const [date] = screen.container.queryAll(
    (view) => view.props.displayedComponents !== undefined,
  );
  await fireEvent(on === 'date' ? date : screen.getByText('Date'), 'touchEnd');
  return onOpen;
}

test('a press on the date reports that the calendar opened', async () => {
  expect(await pressed('date')).toHaveBeenCalledTimes(1);
});

test('a press on the label does not', async () => {
  expect(await pressed('label')).not.toHaveBeenCalled();
});

test('a press on a disabled field does not', async () => {
  expect(await pressed('date', true)).not.toHaveBeenCalled();
});
