import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FadeText } from '../../src/ui/fade-text';

const FONT_SIZE = 34;

/** Shows the text, then reports how wide it wants to be and how wide its box is, as the native layout does. */
async function showText(
  props: { minFontSize?: number; expanded?: boolean },
  { box, text }: { box: number; text: number },
) {
  await render(
    <FadeText style={{ fontSize: FONT_SIZE }} {...props}>
      Brisbane
    </FadeText>,
  );
  const [measuring] = screen.container.queryAll(
    (node) => typeof node.props.onTextLayout === 'function',
  );
  await fireEvent(measuring, 'textLayout', {
    nativeEvent: { lines: [{ width: text }] },
  });
  const [container] = screen.container.queryAll(
    (node) => typeof node.props.onLayout === 'function',
  );
  await fireEvent(container, 'layout', {
    nativeEvent: { layout: { width: box } },
  });
}

const shownLine = () => screen.getByText('Brisbane');
const shownFontSize = () =>
  StyleSheet.flatten(shownLine().props.style).fontSize;
const isMasked = () =>
  screen.container.queryAll((node) => String(node.type) === 'RNCMaskedView')
    .length > 0;

test('leaves text that fits as it is', async () => {
  await showText({}, { box: 200, text: 100 });

  expect(shownFontSize()).toBe(FONT_SIZE);
  expect(shownLine().props.numberOfLines).toBe(1);
  expect(isMasked()).toBe(false);
});

test('fades the end of text that does not fit', async () => {
  await showText({}, { box: 200, text: 400 });

  expect(shownFontSize()).toBe(FONT_SIZE);
  expect(shownLine().props.ellipsizeMode).toBe('clip');
  expect(isMasked()).toBe(true);
});

test('shrinks text that does not fit, down to its minimum, before it fades', async () => {
  await showText({ minFontSize: 24 }, { box: 300, text: 400 });

  expect(shownFontSize()).toBeCloseTo(FONT_SIZE * 0.75 * 0.98);
  expect(isMasked()).toBe(false);
});

test('fades text that does not fit at its minimum size', async () => {
  await showText({ minFontSize: 24 }, { box: 200, text: 400 });

  expect(shownFontSize()).toBeCloseTo(24);
  expect(isMasked()).toBe(true);
});

test('wraps expanded text at the size its line uses, with no fade', async () => {
  await showText({ minFontSize: 24, expanded: true }, { box: 200, text: 400 });

  expect(shownFontSize()).toBeCloseTo(24);
  expect(shownLine().props.numberOfLines).toBeUndefined();
  expect(isMasked()).toBe(false);
});
