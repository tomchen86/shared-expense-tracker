import { useLocales } from 'expo-localization';

const resolved = new Map<string, string>();

/**
 * The app is in English, so dates and amounts use English with the region the phone is set to, or
 * plain English where the platform has no locale for that region. Left to Intl, a missing locale
 * falls back to the phone's own language on Android, and the iOS date picker ignores it.
 */
export function useDisplayLocale() {
  const { regionCode } = useLocales()[0];
  if (!regionCode) return 'en';
  let locale = resolved.get(regionCode);
  if (!locale) {
    locale = new Intl.DateTimeFormat(`en-${regionCode}`, {
      localeMatcher: 'lookup',
    }).resolvedOptions().locale;
    resolved.set(regionCode, locale);
  }
  return locale;
}
