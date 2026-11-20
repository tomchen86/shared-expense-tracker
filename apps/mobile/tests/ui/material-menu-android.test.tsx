import { useState } from 'react';
import { Button } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MaterialMenu } from '../../src/ui/material-menu.android';

function Menu({ multiple }: { multiple: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <MaterialMenu
      options={[{ id: 'shopping', name: 'Shopping' }]}
      selected={selected}
      multiple={multiple}
      onSelect={(id) => setSelected(selected.includes(id) ? [] : [id])}
    >
      {(open) => <Button title="Options" onPress={open} />}
    </MaterialMenu>
  );
}

const open = () =>
  fireEvent.press(screen.getByRole('button', { name: /^options$/i }));
const option = () => screen.getByText('Shopping');

test('keeps a multiple-choice menu open while the named option is checked and unchecked', async () => {
  await render(<Menu multiple />);
  await open();
  expect(option().props.accessibilityState.checked).toBe(false);
  await fireEvent.press(option());
  expect(option().props.accessibilityState.checked).toBe(true);
  await fireEvent(option(), 'itemPressed');
  expect(option().props.accessibilityState.checked).toBe(false);
  await fireEvent(option(), 'dismissRequest');
  expect(screen.queryByText('Shopping')).toBeNull();
});

test('closes a single-choice menu and shows the checked option when reopened', async () => {
  await render(<Menu multiple={false} />);
  await open();
  await fireEvent.press(option());
  expect(screen.queryByText('Shopping')).toBeNull();
  await open();
  expect(option().props.accessibilityState.checked).toBe(true);
});
