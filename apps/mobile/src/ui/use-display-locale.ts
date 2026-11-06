import { useLocales } from 'expo-localization';

/** The app is in English, so dates and amounts use English with the region the phone is set to. */
export function useDisplayLocale() {
  const { regionCode } = useLocales()[0];
  return regionCode ? `en-${regionCode}` : 'en';
}
