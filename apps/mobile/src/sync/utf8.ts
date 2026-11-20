/**
 * The text that `bytes` are in UTF-8. Throws when they are not UTF-8, overlong forms and
 * surrogates included. Decoded here, so that every phone takes the same bytes for the same
 * text whatever its JavaScript engine does with bytes that are wrong.
 */
export function utf8Text(bytes: Uint8Array): string {
  // The least code point each length may write; a byte that starts none has no length.
  const least = [Infinity, 0, 0x80, 0x800, 0x10000];
  let text = '';
  let units: number[] = [];
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index];
    const length =
      first < 0x80
        ? 1
        : first < 0xc2 || first > 0xf4
          ? 0
          : first < 0xe0
            ? 2
            : first < 0xf0
              ? 3
              : 4;
    let point = length === 1 ? first : first & (0x7f >> length);
    for (let next = 1; next < length; next += 1) {
      // Past the end there is no byte, which is no continuation byte either.
      const byte = bytes[index + next];
      if ((byte & 0xc0) !== 0x80) throw new Error('Not UTF-8');
      point = (point << 6) | (byte & 0x3f);
    }
    if (
      point < least[length] ||
      point > 0x10ffff ||
      (point >= 0xd800 && point <= 0xdfff)
    )
      throw new Error('Not UTF-8');
    if (point > 0xffff)
      units.push(
        0xd800 + ((point - 0x10000) >> 10),
        0xdc00 + ((point - 0x10000) & 0x3ff),
      );
    else units.push(point);
    if (units.length >= 8192) {
      text += String.fromCharCode(...units);
      units = [];
    }
    index += length;
  }
  return text + String.fromCharCode(...units);
}
