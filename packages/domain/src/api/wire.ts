// A group ID, an event ID and a device ID are each a lowercase version-4 UUID.
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LOWERCASE_HEX = /^[0-9a-f]*$/;

/** Whether `value` is an object, as JSON has them, with exactly the keys `keys`. */
export function hasExactly<Key extends string>(
  value: unknown,
  keys: readonly Key[],
): value is Record<Key, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** A whole number from `least` to the largest integer a number holds exactly. */
export function isWhole(value: unknown, least: number): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= least
  );
}

/** Two lowercase hexadecimal characters per byte, within the given byte limits. */
export function isHexContent(
  value: unknown,
  minimum: number,
  limit: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.length >= minimum * 2 &&
    value.length <= limit * 2 &&
    value.length % 2 === 0 &&
    LOWERCASE_HEX.test(value)
  );
}
