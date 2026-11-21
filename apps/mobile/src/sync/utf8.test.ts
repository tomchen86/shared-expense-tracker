import { utf8Text } from './utf8';

// What a fatal decoder that keeps a byte order mark gives: the standard this one follows.
const standard = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function decoded(decode: (bytes: Uint8Array) => string, bytes: Uint8Array) {
  try {
    return decode(bytes);
  } catch {
    return undefined;
  }
}

const same = (bytes: Uint8Array) =>
  expect(decoded(utf8Text, bytes)).toBe(
    decoded((given) => standard.decode(given), bytes),
  );

test('decodes text of every length a code point takes, also past the 8,192 units it joins at a time', () => {
  const text = `{"note":"${'a'.repeat(9000)}é晚餐🍜\u0000"}`;
  expect(utf8Text(new TextEncoder().encode(text))).toBe(text);
  expect(utf8Text(new Uint8Array(0))).toBe('');
});

test.each([
  ['a continuation byte first', [0x80]],
  ['an overlong two-byte form', [0xc0, 0xaf]],
  ['an overlong three-byte form', [0xe0, 0x80, 0xaf]],
  ['an overlong four-byte form', [0xf0, 0x80, 0x80, 0xaf]],
  ['a surrogate', [0xed, 0xa0, 0x80]],
  ['a code point past U+10FFFF', [0xf4, 0x90, 0x80, 0x80]],
  ['a lead byte past 0xf4', [0xf8, 0x90, 0x80, 0x80]],
  ['a sequence cut short', [0xe6, 0x99]],
  ['a lead byte with no continuation byte after it', [0xc3, 0x28]],
])('refuses %s', (_case, bytes) => {
  expect(() => utf8Text(new Uint8Array(bytes))).toThrow();
});

test('agrees with the standard decoder on 20,000 runs of random bytes', () => {
  // A fixed sequence, so a failure can be run again.
  let state = 20261120;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  // Mostly bytes that start or continue a sequence, so many runs are valid UTF-8.
  const pool = [0x24, 0x7f, 0x80, 0xbf, 0xc2, 0xdf, 0xe0, 0xa0, 0xed, 0x9f];
  pool.push(0xef, 0xbb, 0xf0, 0x90, 0xf4, 0x8f, 0xf5, 0xc1, 0xff, 0x00);
  for (let run = 0; run < 20_000; run += 1) {
    const bytes = Uint8Array.from({ length: next() % 7 }, () =>
      next() % 4 === 0 ? next() % 256 : pool[next() % pool.length],
    );
    same(bytes);
  }
});
