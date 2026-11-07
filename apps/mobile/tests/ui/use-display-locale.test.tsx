import { renderHook } from '@testing-library/react-native';
import { useLocales } from 'expo-localization';
import { useDisplayLocale } from '../../src/ui/use-display-locale';

jest.mock('expo-localization', () => ({ useLocales: jest.fn() }));

// Node has no en-VN, so this checks that the hook resolves the locale. It does not check lookup: Node
// falls back to en without it, where Android falls back to the phone's own language.
test.each([
  ['AU', 'en-AU'],
  ['VN', 'en'],
  [null, 'en'],
])('with the region %s, uses %s', async (regionCode, locale) => {
  jest.mocked(useLocales).mockReturnValue([{ regionCode }] as never);

  const { result } = await renderHook(() => useDisplayLocale());

  expect(result.current).toBe(locale);
});
