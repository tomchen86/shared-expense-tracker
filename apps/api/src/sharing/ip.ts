import { toHex } from './hex';

// What stands for the IP a registration came from (SHARING-41.1, 42.1): the part of the
// address that counts as one IP, and the keyed hash of it that the database keeps.

const IPV4_PART = /^(0|[1-9][0-9]{0,2})$/;
const IPV6_GROUP = /^[0-9a-fA-F]{1,4}$/;

function ipv4Bytes(text: string): number[] | undefined {
  const parts = text.split('.');
  if (parts.length !== 4) return undefined;
  const bytes = parts.map((part) =>
    IPV4_PART.test(part) ? Number(part) : 256,
  );
  return bytes.every((byte) => byte <= 255) ? bytes : undefined;
}

/** The bytes of colon-separated groups; the last may be an IPv4 address when `mayEndInIpv4`. */
function groupBytes(text: string, mayEndInIpv4: boolean): number[] | undefined {
  if (text === '') return [];
  const groups = text.split(':');
  const bytes: number[] = [];
  for (const [index, group] of groups.entries()) {
    if (IPV6_GROUP.test(group)) {
      const value = Number.parseInt(group, 16);
      bytes.push(value >> 8, value & 255);
      continue;
    }
    const ipv4 =
      mayEndInIpv4 && index === groups.length - 1
        ? ipv4Bytes(group)
        : undefined;
    if (!ipv4) return undefined;
    bytes.push(...ipv4);
  }
  return bytes;
}

function ipv6Bytes(text: string): number[] | undefined {
  // A zone, as in fe80::1%en0, names an interface of this machine, not another address.
  const zone = text.indexOf('%');
  const halves = (zone < 0 ? text : text.slice(0, zone)).split('::');
  if (halves.length > 2) return undefined;
  const [first, last] = halves;
  const head = groupBytes(first, last === undefined);
  const tail = last === undefined ? [] : groupBytes(last, true);
  if (!head || !tail) return undefined;
  const given = head.length + tail.length;
  // `::` stands for one group of zeros or more.
  if (last === undefined ? given !== 16 : given > 14) return undefined;
  return [...head, ...new Array<number>(16 - given).fill(0), ...tail];
}

/**
 * The bytes that count as one IP: an IPv4 address's four, also when it is written as
 * IPv6 (`::ffff:203.0.113.7`), and the first 64 bits of any other IPv6 address, since one
 * network holds all the addresses behind them. Undefined when `address` is not an IP
 * address.
 */
export function countedIp(
  address: string,
): Uint8Array<ArrayBuffer> | undefined {
  const ipv4 = ipv4Bytes(address);
  if (ipv4) return Uint8Array.from(ipv4);
  const ipv6 = ipv6Bytes(address);
  if (!ipv6) return undefined;
  const writesIpv4 =
    ipv6.slice(0, 10).every((byte) => byte === 0) &&
    ipv6[10] === 255 &&
    ipv6[11] === 255;
  return Uint8Array.from(writesIpv4 ? ipv6.slice(12) : ipv6.slice(0, 8));
}

/**
 * The keyed hash that stands for the IP `address` in the database, in hexadecimal:
 * HMAC-SHA-256 under `key` of the bytes that count as one IP. Undefined when there is no
 * key, the key is empty, or `address` is not an IP address (SHARING-44.1).
 */
export async function keyedIpHash(
  key: string | undefined,
  address: string | undefined,
): Promise<string | undefined> {
  if (!key || address === undefined) return undefined;
  const ip = countedIp(address);
  if (!ip) return undefined;
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, ip)));
}
