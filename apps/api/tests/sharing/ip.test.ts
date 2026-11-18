import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { countedIp, keyedIpHash } from '../../src/sharing/ip';

const bytes = (address: string) => {
  const counted = countedIp(address);
  return counted && Array.from(counted);
};

describe('countedIp', () => {
  test.each<[string, number[]]>([
    ['203.0.113.7', [203, 0, 113, 7]],
    ['0.0.0.0', [0, 0, 0, 0]],
    ['255.255.255.255', [255, 255, 255, 255]],
    ['127.0.0.1', [127, 0, 0, 1]],
  ])('counts the IPv4 address %s by its four bytes', (address, expected) => {
    expect(bytes(address)).toEqual(expected);
  });

  test.each<[string, number[]]>([
    ['2001:db8:1:2::1', [0x20, 0x01, 0x0d, 0xb8, 0, 1, 0, 2]],
    [
      '2001:0db8:0001:0002:ffff:ffff:ffff:ffff',
      [0x20, 0x01, 0x0d, 0xb8, 0, 1, 0, 2],
    ],
    ['2001:DB8:1:2::2', [0x20, 0x01, 0x0d, 0xb8, 0, 1, 0, 2]],
    ['2001:db8:1:2:3:4:5:6', [0x20, 0x01, 0x0d, 0xb8, 0, 1, 0, 2]],
    ['2001:db8:1:3::1', [0x20, 0x01, 0x0d, 0xb8, 0, 1, 0, 3]],
    ['::', [0, 0, 0, 0, 0, 0, 0, 0]],
    ['::1', [0, 0, 0, 0, 0, 0, 0, 0]],
    ['1::', [0, 1, 0, 0, 0, 0, 0, 0]],
    ['1:2:3:4:5:6:7::', [0, 1, 0, 2, 0, 3, 0, 4]],
    ['::2:3:4:5:6:7:8', [0, 0, 0, 2, 0, 3, 0, 4]],
    ['fe80::1%en0', [0xfe, 0x80, 0, 0, 0, 0, 0, 0]],
    ['64:ff9b::198.51.100.20', [0, 0x64, 0xff, 0x9b, 0, 0, 0, 0]],
    ['1:2:3:4:5:6:198.51.100.20', [0, 1, 0, 2, 0, 3, 0, 4]],
    ['::198.51.100.20', [0, 0, 0, 0, 0, 0, 0, 0]],
  ])('counts the IPv6 address %s by its first 64 bits', (address, expected) => {
    expect(bytes(address)).toEqual(expected);
  });

  test.each([
    '::ffff:198.51.100.20',
    '::FFFF:198.51.100.20',
    '0:0:0:0:0:ffff:198.51.100.20',
    '::ffff:c633:6414',
    '0000:0000:0000:0000:0000:ffff:c633:6414',
  ])('counts %s as the IPv4 address it writes', (address) => {
    expect(bytes(address)).toEqual([198, 51, 100, 20]);
  });

  const NOT_ADDRESSES = [
    '',
    ' ',
    'unknown',
    'localhost',
    'example.test',
    '203.0.113',
    '203.0.113.7.1',
    '203.0.113.256',
    '203.0.113.-1',
    '203.0.113.07',
    '203.0.113.0x7',
    '203.0.113.7 ',
    ' 203.0.113.7',
    '203.0.113.7\n',
    '203.0.113.',
    '.0.113.7',
    '203.0.113.7:443',
    '3405803783',
    ':',
    ':::',
    '::1::',
    '1::2::3',
    ':1',
    '1:',
    '1:2:3:4:5:6:7',
    '1:2:3:4:5:6:7:8:9',
    '1:2:3:4:5:6:7:8::',
    '::1:2:3:4:5:6:7:8',
    '12345::',
    'g::1',
    '1.2.3.4::',
    '::1.2.3.4:5',
    '::1.2.3.4.5',
    '::1.2.3',
    '1:2:3:4:5:6:7:1.2.3.4',
    '[::1]',
    '::1/64',
    '%en0',
  ];

  test.each(NOT_ADDRESSES)('takes %j for no IP address', (text) => {
    expect(countedIp(text)).toBeUndefined();
  });

  test("agrees with Node on what an IP address is, for every writing above and Node's own", () => {
    const writings = [
      ...NOT_ADDRESSES,
      '203.0.113.7',
      '2001:db8:1:2::1',
      '2001:DB8:1:2::2',
      '::',
      '::1',
      '1::',
      '1:2:3:4:5:6:7::',
      '::2:3:4:5:6:7:8',
      'fe80::1%en0',
      '::ffff:198.51.100.20',
      '64:ff9b::198.51.100.20',
      '1:2:3:4:5:6:198.51.100.20',
      '::ffff:c633:6414',
    ];

    for (const writing of writings) {
      expect([writing, countedIp(writing) !== undefined]).toEqual([
        writing,
        isIP(writing) !== 0,
      ]);
    }
  });
});

describe('keyedIpHash', () => {
  const KEY = 'a key for this test';
  const hmac = (key: string, counted: number[]) =>
    createHmac('sha256', key).update(Uint8Array.from(counted)).digest('hex');

  test('is HMAC-SHA-256, under the key, of the bytes that count as the IP', async () => {
    expect(await keyedIpHash(KEY, '203.0.113.7')).toBe(
      hmac(KEY, [203, 0, 113, 7]),
    );
    expect(await keyedIpHash(KEY, '2001:db8:1:2::1')).toBe(
      hmac(KEY, [0x20, 0x01, 0x0d, 0xb8, 0, 1, 0, 2]),
    );
    expect(await keyedIpHash('鑰匙 🔑', '203.0.113.7')).toBe(
      hmac('鑰匙 🔑', [203, 0, 113, 7]),
    );
  });

  test('is the same for addresses that count as one IP, and differs for others and for another key', async () => {
    const hash = await keyedIpHash(KEY, '2001:db8:1:2::1');

    expect(await keyedIpHash(KEY, '2001:0db8:0001:0002:ffff::')).toBe(hash);
    expect(await keyedIpHash(KEY, '2001:db8:1:3::1')).not.toBe(hash);
    expect(await keyedIpHash('another key', '2001:db8:1:2::1')).not.toBe(hash);
    expect(await keyedIpHash(KEY, '::ffff:203.0.113.7')).toBe(
      await keyedIpHash(KEY, '203.0.113.7'),
    );
  });

  test.each<[string, string | undefined, string | undefined]>([
    ['no key', undefined, '203.0.113.7'],
    ['an empty key', '', '203.0.113.7'],
    ['no address', KEY, undefined],
    ['an empty address', KEY, ''],
    ['an address that is no IP', KEY, 'unknown'],
  ])('is nothing with %s', async (_, key, address) => {
    expect(await keyedIpHash(key, address)).toBeUndefined();
  });
});
