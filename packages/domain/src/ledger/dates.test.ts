import { isLocalDate, toLocalDate } from './dates';

test.each<[string, string, string]>([
  ['Asia/Kathmandu', '2025-01-01T18:20:00Z', '2025-01-02'],
  ['Pacific/Kiritimati', '2024-12-31T10:00:00Z', '2025-01-01'],
  ['Pacific/Honolulu', '2025-01-01T09:59:59Z', '2024-12-31'],
  ['Australia/Sydney', '2025-04-05T15:59:59Z', '2025-04-06'],
  ['Australia/Sydney', '2025-04-05T16:00:00Z', '2025-04-06'],
  ['America/Los_Angeles', '2025-03-09T09:59:59Z', '2025-03-09'],
  ['America/Los_Angeles', '2025-03-09T10:00:00Z', '2025-03-09'],
  ['UTC', '0200-01-02T00:00:00Z', '0200-01-02'],
])('uses calendar fields in %s at %s', (timeZone, instant, expected) => {
  const date = new Date(instant);
  const timestamp = date.getTime();
  expect(toLocalDate(date, timeZone)).toBe(expected);
  expect(date.getTime()).toBe(timestamp);
});

test.each(['2000-02-29', '2400-02-29', '2024-04-30', '2024-01-31'])(
  'accepts a valid calendar date %s',
  (text) => {
    expect(isLocalDate(text)).toBe(true);
  },
);

test.each([
  '1900-02-29',
  '2100-02-29',
  '2024-04-31',
  '2024-00-01',
  '2024-01-00',
  '2024-01-32',
  '2024-12-31\n',
  ' 2024-12-31',
  '2024-12-31T00:00:00Z',
])('rejects an impossible or noncanonical date %p', (text) => {
  expect(isLocalDate(text)).toBe(false);
});
