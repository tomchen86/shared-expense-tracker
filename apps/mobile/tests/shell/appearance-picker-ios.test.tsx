import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppearancePicker } from '../../src/ui/appearance-picker';

function nativePicker() {
  const views = screen.UNSAFE_root.findAll(
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
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        /^ViewManagerAdapter_ExpoUI/.test(String(node.type)) &&
        typeof node.props.text === 'string',
    )
    .map((node) => ({
      text: node.props.text,
      modifiers: node.props.modifiers,
    }));
}

test('configures a large native SwiftUI segmented control named Appearance with System, Light, and Dark', () => {
  const onChange = jest.fn();
  const view = render(<AppearancePicker onChange={onChange} value="system" />);

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

  view.rerender(<AppearancePicker onChange={onChange} value="light" />);
  expect(nativePicker().props.selection).toBe(1);

  view.rerender(<AppearancePicker onChange={onChange} value="dark" />);
  expect(nativePicker().props.selection).toBe(2);
});

test('forwards native segment selection events and locks while disabled', () => {
  const onChange = jest.fn();
  const view = render(<AppearancePicker onChange={onChange} value="system" />);

  act(() => {
    fireEvent(nativePicker(), 'selectionChange', {
      nativeEvent: { selection: 2 },
    });
  });
  expect(onChange).toHaveBeenCalledWith('dark');

  act(() => {
    fireEvent(nativePicker(), 'selectionChange', {
      nativeEvent: { selection: 1 },
    });
  });
  expect(onChange).toHaveBeenCalledWith('light');

  act(() => {
    fireEvent(nativePicker(), 'selectionChange', {
      nativeEvent: { selection: 0 },
    });
  });
  expect(onChange).toHaveBeenCalledWith('system');

  onChange.mockClear();
  view.rerender(
    <AppearancePicker disabled onChange={onChange} value="system" />,
  );
  expect(nativePicker().props.modifiers).toEqual(
    expect.arrayContaining([{ $type: 'disabled', disabled: true }]),
  );

  act(() => {
    fireEvent(nativePicker(), 'selectionChange', {
      nativeEvent: { selection: 2 },
    });
  });
  expect(onChange).not.toHaveBeenCalled();
});

test('remounts the native picker when a locked selection finishes without changing value', () => {
  const onChange = jest.fn();
  const view = render(<AppearancePicker onChange={onChange} value="system" />);
  const initialPicker = nativePicker();

  act(() => {
    fireEvent(initialPicker, 'selectionChange', {
      nativeEvent: { selection: 2 },
    });
  });
  view.rerender(
    <AppearancePicker disabled onChange={onChange} value="system" />,
  );
  view.rerender(<AppearancePicker onChange={onChange} value="system" />);

  const resetPicker = nativePicker();
  expect(resetPicker).not.toBe(initialPicker);
  expect(resetPicker.props.selection).toBe(0);
});
