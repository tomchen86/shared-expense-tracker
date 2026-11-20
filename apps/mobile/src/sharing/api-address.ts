/**
 * Where the API this build talks to is, such as `https://api.example.test`: the build's
 * `EXPO_PUBLIC_API_URL`, which Metro inlines when it bundles. Undefined when the build
 * names none, and such a build never syncs (SYNC-93.1, ADR-0027).
 */
export const apiUrl = (): string | undefined =>
  process.env.EXPO_PUBLIC_API_URL || undefined;
