import { render, screen } from '@testing-library/react-native';
import { MenuField } from '../../src/ui/menu-field';

// A system menu keeps an image's color, but ignores a symbol's (menu-field.ios.tsx).

jest.mock('expo-asset', () => ({
  useAssets: (image: { testUri: string }) => [
    [{ localUri: `file:///${image.testUri.split('/').pop()}` }],
  ],
}));

const images = () =>
  screen.container
    .queryAll((view) => typeof view.props.uiImage === 'string')
    .map((view) => view.props.uiImage);

async function showOptions(colors: (string | undefined)[]) {
  await render(
    <MenuField
      title="Category"
      label="Category"
      value="Food"
      options={colors.map((color, index) => ({
        id: String(index),
        name: `Option ${index}`,
        color,
      }))}
      selected={['0']}
      onSelect={() => {}}
    />,
  );
}

test('puts a dot image of its color before an option', async () => {
  await showOptions(['#D81B60', '#1E88E5']);

  expect(images()).toEqual(['file:///D81B60.png', 'file:///1E88E5.png']);
});

test('finds the image of a color in any case', async () => {
  await showOptions(['#d81b60']);

  expect(images()).toEqual(['file:///D81B60.png']);
});

test('puts none before an option with no color, or one outside the palette', async () => {
  await showOptions([undefined, '#123456']);

  expect(images()).toEqual([]);
});
