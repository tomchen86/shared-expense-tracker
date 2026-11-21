import { useState } from 'react';
import { Button } from 'react-native';
import {
  fireEvent,
  isHiddenFromAccessibility,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { DropdownMenuGroup } from '@expo/ui/jetpack-compose';
import type { ModifierConfig } from '@expo/ui/jetpack-compose/modifiers';
import { MaterialMenu } from '../../src/ui/material-menu.android';
import { componentsIn } from '../acceptance/shell-tabs-app';

function Menu({ multiple }: { multiple: boolean }) {
  const [selected, setSelected] = useState(['food']);
  return (
    <MaterialMenu
      options={[
        { id: 'food', name: 'Food & Dining' },
        { id: 'shopping', name: 'Shopping' },
      ]}
      selected={selected}
      multiple={multiple}
      onSelect={(id) => {
        if (!multiple) setSelected([id]);
        else if (selected.includes(id))
          setSelected(selected.filter((value) => value !== id));
        else setSelected([...selected, id]);
      }}
    >
      {(open) => <Button title="Options" onPress={open} />}
    </MaterialMenu>
  );
}

const open = () =>
  fireEvent.press(screen.getByRole('button', { name: /^options$/i }));

test('scrolls all options inside the group that draws the menu shadow', async () => {
  await render(<Menu multiple />);
  await open();
  const [group] = componentsIn(
    screen.root!,
    (type) => type === DropdownMenuGroup,
  );
  const scrollContainers = screen.container.queryAll((node) =>
    node.props.modifiers?.some(
      (modifier: ModifierConfig) => modifier.$type === 'verticalScroll',
    ),
  );
  expect(scrollContainers).toHaveLength(1);
  const [rows] = scrollContainers;
  expect(group.view).toContainElement(rows);
  expect(within(rows).getAllByRole('checkbox')).toHaveLength(2);
});

test('exposes one named checkbox per row and toggles it from its words or its accessibility action', async () => {
  await render(<Menu multiple />);
  await open();
  const shopping = (checked: boolean) =>
    screen.getByRole('checkbox', { name: 'Shopping', checked });
  const row = shopping(false);
  expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  expect(screen.getByLabelText('Shopping')).toBe(row);
  expect(row.props.focusable).toBe(true);
  const labels = row.queryAll((node) => node.props.text === 'Shopping');
  expect(labels).toHaveLength(1);
  expect(isHiddenFromAccessibility(labels[0])).toBe(true);
  await fireEvent(labels[0], 'itemPressed');
  await fireEvent.press(shopping(true));
  expect(
    screen.getByRole('checkbox', { name: 'Food & Dining', checked: true }),
  ).toBeTruthy();
  await fireEvent(shopping(false), 'dismissRequest');
  expect(screen.queryByLabelText('Shopping')).toBeNull();
});

test('closes a single-choice menu and shows the checked option when reopened', async () => {
  await render(<Menu multiple={false} />);
  await open();
  const shopping = (checked: boolean) =>
    screen.getByRole('radio', { name: 'Shopping', checked });
  await fireEvent.press(shopping(false));
  expect(screen.queryByLabelText('Shopping')).toBeNull();
  await open();
  await fireEvent.press(shopping(true));
  expect(screen.queryByLabelText('Shopping')).toBeNull();
});
