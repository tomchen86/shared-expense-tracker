import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppearancePicker } from '../../src/ui/appearance-picker';

function nativePicker() {
  const views = screen.container.queryAll(
    (node) =>
      typeof node.type === 'string' &&
      /^ViewManagerAdapter_ExpoUI/.test(String(node.type)) &&
      typeof node.props.onSelectionChange === 'function',
  );
  expect(views).toHaveLength(1);
  return views[0];
}

function pickerSegments(picker = nativePicker()) {
  return picker
    .queryAll(
      (node) =>
        typeof node.type === 'string' &&
        /^ViewManagerAdapter_ExpoUI/.test(String(node.type)) &&
        typeof node.props.text === 'string',
      { includeSelf: true },
    )
    .map((node) => ({
      text: node.props.text,
      modifiers: node.props.modifiers,
    }));
}

test('configures a large native SwiftUI segmented control named Appearance with System, Light, and Dark', async () => {
  const onChange = jest.fn();
  const view = await render(
    <AppearancePicker onChange={onChange} value="system" />,
  );

  const picker = nativePicker();
  expect(picker.props.label).toBe('Appearance');
  expect(picker.props.selection).toBe(0);
  expect(picker.props.modifiers).toEqual(
    expect.arrayContaining([
      { $type: 'pickerStyle', style: 'segmented' },
      { $type: 'controlSize', size: 'large' },
      { $type: 'accessibilityElement', children: 'contain' },
      { $type: 'accessibilityLabel', label: 'Appearance' },
    ]),
  );
  expect(pickerSegments(picker)).toEqual([
    { text: 'System', modifiers: [{ $type: 'tag', tag: 0 }] },
    { text: 'Light', modifiers: [{ $type: 'tag', tag: 1 }] },
    { text: 'Dark', modifiers: [{ $type: 'tag', tag: 2 }] },
  ]);

  await view.rerender(<AppearancePicker onChange={onChange} value="light" />);
  expect(nativePicker().props.selection).toBe(1);

  await view.rerender(<AppearancePicker onChange={onChange} value="dark" />);
  expect(nativePicker().props.selection).toBe(2);
});

test('forwards native segment selection events and locks while disabled', async () => {
  const onChange = jest.fn();
  const view = await render(
    <AppearancePicker onChange={onChange} value="system" />,
  );

  await act(async () => {
    await fireEvent(nativePicker(), 'selectionChange', {
      nativeEvent: { selection: 2 },
    });
  });
  expect(onChange).toHaveBeenCalledWith('dark');

  await act(async () => {
    await fireEvent(nativePicker(), 'selectionChange', {
      nativeEvent: { selection: 1 },
    });
  });
  expect(onChange).toHaveBeenCalledWith('light');

  await act(async () => {
    await fireEvent(nativePicker(), 'selectionChange', {
      nativeEvent: { selection: 0 },
    });
  });
  expect(onChange).toHaveBeenCalledWith('system');

  onChange.mockClear();
  await view.rerender(
    <AppearancePicker disabled onChange={onChange} value="system" />,
  );
  expect(nativePicker().props.modifiers).toEqual(
    expect.arrayContaining([{ $type: 'disabled', disabled: true }]),
  );

  await act(async () => {
    await fireEvent(nativePicker(), 'selectionChange', {
      nativeEvent: { selection: 2 },
    });
  });
  expect(onChange).not.toHaveBeenCalled();
});

test('locks by toggling the disabled modifier, keeping the same modifiers so the slide animation survives', async () => {
  const view = await render(
    <AppearancePicker onChange={jest.fn()} value="system" />,
  );
  const unlocked = nativePicker().props.modifiers;

  await view.rerender(
    <AppearancePicker disabled onChange={jest.fn()} value="system" />,
  );
  const locked = nativePicker().props.modifiers;

  const types = (modifiers: { $type: string }[]) =>
    modifiers.map((modifier) => modifier.$type);
  expect(types(locked)).toEqual(types(unlocked));
  expect(unlocked).toContainEqual({ $type: 'disabled', disabled: false });
  expect(locked).toContainEqual({ $type: 'disabled', disabled: true });
});

test('remounts the native picker when a locked selection finishes without changing value', async () => {
  const onChange = jest.fn();
  const view = await render(
    <AppearancePicker onChange={onChange} value="system" />,
  );
  const initialPicker = nativePicker();

  await act(async () => {
    await fireEvent(initialPicker, 'selectionChange', {
      nativeEvent: { selection: 2 },
    });
  });
  await view.rerender(
    <AppearancePicker disabled onChange={onChange} value="system" />,
  );
  await view.rerender(<AppearancePicker onChange={onChange} value="system" />);

  const resetPicker = nativePicker();
  expect(resetPicker).not.toBe(initialPicker);
  expect(resetPicker.props.selection).toBe(0);
});
