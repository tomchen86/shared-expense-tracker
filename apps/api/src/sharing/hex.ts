const DIGITS = '0123456789abcdef';

/** Bytes as lowercase hexadecimal. */
export function toHex(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += DIGITS[byte >> 4] + DIGITS[byte & 15];
  return text;
}

/** The bytes that `hex`, an even number of hexadecimal characters, writes. */
export function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
