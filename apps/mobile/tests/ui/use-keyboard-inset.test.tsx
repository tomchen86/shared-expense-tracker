import type { ComponentRef } from 'react';
import { DeviceEventEmitter, Platform, type ScrollView } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useKeyboardInset } from '../../src/ui/use-keyboard-inset';

// A scroll view that ends at y = 700 and whose bottom moves up with the inset it was given.
function setup() {
  const bottom = { current: 700 };
  const ref = {
    current: {
      measureInWindow: (
        callback: (x: number, y: number, w: number, h: number) => void,
      ) => callback(0, 100, 400, bottom.current - 100),
    } as unknown as ComponentRef<typeof ScrollView>,
  };
  return { bottom, ref };
}

const keyboard = (screenY: number) => ({
  endCoordinates: { screenY, screenX: 0, width: 400, height: 800 - screenY },
});

test('leaves the scroll view to the platform on iOS, and shrinks it above the keyboard on Android', async () => {
  const { bottom, ref } = setup();
  const { result } = await renderHook(() => useKeyboardInset(ref));
  expect(result.current).toBeUndefined();

  await act(async () => {
    DeviceEventEmitter.emit('keyboardDidShow', keyboard(500));
  });
  if (Platform.OS === 'ios') {
    expect(result.current).toBeUndefined();
    return;
  }
  expect(result.current).toEqual({ marginBottom: 200 });

  // The keyboard grows while open: the bottom it measures already has the inset.
  bottom.current = 500;
  await act(async () => {
    DeviceEventEmitter.emit('keyboardDidShow', keyboard(450));
  });
  expect(result.current).toEqual({ marginBottom: 250 });

  await act(async () => {
    DeviceEventEmitter.emit('keyboardDidHide', keyboard(800));
  });
  expect(result.current).toBeUndefined();
});

test('adds nothing when the keyboard ends below the scroll view', async () => {
  const { ref } = setup();
  const { result } = await renderHook(() => useKeyboardInset(ref));
  await act(async () => {
    DeviceEventEmitter.emit('keyboardDidShow', keyboard(750));
  });
  expect(result.current).toBeUndefined();
});
