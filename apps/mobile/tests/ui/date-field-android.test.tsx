import { render, screen } from '@testing-library/react-native';
import { DateField } from '../../src/ui/date-field';

test('announces the date control by its field name and exposes the selected date as its value', () => {
  render(
    <DateField
      label="Date"
      value="2026-10-30"
      maximumDate="2026-10-31"
      onChange={jest.fn()}
    />,
  );

  expect(screen.getByLabelText('Date')).toHaveAccessibilityValue({
    text: '2026-10-30',
  });
});
