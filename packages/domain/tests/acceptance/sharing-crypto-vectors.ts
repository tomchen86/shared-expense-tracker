// Published test vectors and known answers for the encryption tools, as
// docs/specs/sharing/spec.md lists them. Bytes are written as hex.
import type { webcrypto } from 'node:crypto';

/**
 * Whether Web Crypto accepts an Ed25519 signature, checked as the API checks one: from
 * the raw public key. The caller passes Web Crypto's `subtle`, since one test file runs
 * without the global one and cannot import Node's.
 */
export async function webCryptoVerifies(
  subtle: webcrypto.SubtleCrypto,
  publicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array,
): Promise<boolean> {
  const imported = await subtle.importKey(
    'raw',
    new Uint8Array(publicKey),
    'Ed25519',
    false,
    ['verify'],
  );
  return subtle.verify(
    'Ed25519',
    imported,
    new Uint8Array(signature),
    new Uint8Array(message),
  );
}

export function fromHex(text: string): Uint8Array {
  const digits = text.replace(/\s+/g, '');
  return Uint8Array.from({ length: digits.length / 2 }, (_, index) =>
    parseInt(digits.slice(index * 2, index * 2 + 2), 16),
  );
}

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export const utf8 = (text: string): Uint8Array =>
  new TextEncoder().encode(text);

export function concat(...parts: Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

/** `count` bytes that count up from `first` and wrap after 0xff. */
export const bytesFrom = (first: number, count: number): Uint8Array =>
  Uint8Array.from({ length: count }, (_, index) => (first + index) & 0xff);

/** A copy with one bit changed. */
export function flipBit(bytes: Uint8Array, index: number, bit = 0): Uint8Array {
  const changed = Uint8Array.from(bytes);
  changed[index] ^= 1 << bit;
  return changed;
}

/** Every copy of `bytes` that differs from it in exactly one bit, with where. */
export function eachBitFlipped(
  bytes: Uint8Array,
  from = 0,
): [where: string, changed: Uint8Array][] {
  const copies: [string, Uint8Array][] = [];
  for (let index = from; index < bytes.length; index += 1) {
    for (let bit = 0; bit < 8; bit += 1) {
      copies.push([`byte ${index}, bit ${bit}`, flipBit(bytes, index, bit)]);
    }
  }
  return copies;
}

/** The same bytes as a view into the middle of a larger buffer. */
export function insideLargerBuffer(bytes: Uint8Array): Uint8Array {
  const buffer = concat(bytesFrom(0xe0, 5), bytes, bytesFrom(0xf0, 3));
  return buffer.subarray(5, 5 + bytes.length);
}

// XChaCha20-Poly1305: draft-irtf-cfrg-xchacha-03, A.3.1.
export const DRAFT = {
  key: '808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f',
  nonce: '404142434445464748494a4b4c4d4e4f5051525354555657',
  associatedData: '50515253c0c1c2c3c4c5c6c7',
  plaintext:
    "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
  ciphertext: `
    bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb
    731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b452
    2f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff9
    21f9664c97637da9768812f615c68b13b52e`.replace(/\s+/g, ''),
  tag: 'c0875924c1c7987947deafd8780acf49',
  /** The tag of empty content under the same key, nonce and associated data. */
  emptyTag: 'e4c5191f68fd06d9592f83754480d19d',
};

// Ed25519: RFC 8032, 7.1.
export const ED25519_TESTS = [
  {
    name: 'TEST 1',
    secretKey:
      '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
    publicKey:
      'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
    message: '',
    signature:
      'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
  },
  {
    name: 'TEST 2',
    secretKey:
      '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
    publicKey:
      '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
    message: '72',
    signature:
      '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00',
  },
  {
    name: 'TEST 3',
    secretKey:
      'c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7',
    publicKey:
      'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025',
    message: 'af82',
    signature:
      '6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a',
  },
  {
    name: 'TEST 1024',
    secretKey:
      'f5e5767cf153319517630f226876b86c8160cc583bc013744c6bf255f5cc0ee5',
    publicKey:
      '278117fc144c72340f67d0f2316e8386ceffbf2b2428c9c51fef7c597f1d426e',
    message: `
      08b8b2b733424243760fe426a4b54908632110a66c2f6591eabd3345e3e4eb98
      fa6e264bf09efe12ee50f8f54e9f77b1e355f6c50544e23fb1433ddf73be84d8
      79de7c0046dc4996d9e773f4bc9efe5738829adb26c81b37c93a1b270b20329d
      658675fc6ea534e0810a4432826bf58c941efb65d57a338bbd2e26640f89ffbc
      1a858efcb8550ee3a5e1998bd177e93a7363c344fe6b199ee5d02e82d522c4fe
      ba15452f80288a821a579116ec6dad2b3b310da903401aa62100ab5d1a36553e
      06203b33890cc9b832f79ef80560ccb9a39ce767967ed628c6ad573cb116dbef
      efd75499da96bd68a8a97b928a8bbc103b6621fcde2beca1231d206be6cd9ec7
      aff6f6c94fcd7204ed3455c68c83f4a41da4af2b74ef5c53f1d8ac70bdcb7ed1
      85ce81bd84359d44254d95629e9855a94a7c1958d1f8ada5d0532ed8a5aa3fb2
      d17ba70eb6248e594e1a2297acbbb39d502f1a8c6eb6f1ce22b3de1a1f40cc24
      554119a831a9aad6079cad88425de6bde1a9187ebb6092cf67bf2b13fd65f270
      88d78b7e883c8759d2c4f5c65adb7553878ad575f9fad878e80a0c9ba63bcbcc
      2732e69485bbc9c90bfbd62481d9089beccf80cfe2df16a2cf65bd92dd597b07
      07e0917af48bbb75fed413d238f5555a7a569d80c3414a8d0859dc65a46128ba
      b27af87a71314f318c782b23ebfe808b82b0ce26401d2e22f04d83d1255dc51a
      ddd3b75a2b1ae0784504df543af8969be3ea7082ff7fc9888c144da2af58429e
      c96031dbcad3dad9af0dcbaaaf268cb8fcffead94f3c7ca495e056a9b47acdb7
      51fb73e666c6c655ade8297297d07ad1ba5e43f1bca32301651339e22904cc8c
      42f58c30c04aafdb038dda0847dd988dcda6f3bfd15c4b4c4525004aa06eeff8
      ca61783aacec57fb3d1f92b0fe2fd1a85f6724517b65e614ad6808d6f6ee34df
      f7310fdc82aebfd904b01e1dc54b2927094b2db68d6f903b68401adebf5a7e08
      d78ff4ef5d63653a65040cf9bfd4aca7984a74d37145986780fc0b16ac451649
      de6188a7dbdf191f64b5fc5e2ab47b57f7f7276cd419c17a3ca8e1b939ae49e4
      88acba6b965610b5480109c8b17b80e1b7b750dfc7598d5d5011fd2dcc5600a3
      2ef5b52a1ecc820e308aa342721aac0943bf6686b64b2579376504ccc493d97e
      6aed3fb0f9cd71a43dd497f01f17c0e2cb3797aa2a2f256656168e6c496afc5f
      b93246f6b1116398a346f1a641f3b041e989f7914f90cc2c7fff357876e506b5
      0d334ba77c225bc307ba537152f3f1610e4eafe595f6d9d90d11faa933a15ef1
      369546868a7f3a45a96768d40fd9d03412c091c6315cf4fde7cb68606937380d
      b2eaaa707b4c4185c32eddcdd306705e4dc1ffc872eeee475a64dfac86aba41c
      0618983f8741c5ef68d3a101e8a3b8cac60c905c15fc910840b94c00a0b9d0`,
    signature:
      '0aab4c900501b3e24d7cdf4663326a3a87df5e4843b2cbdb67cbf6e460fec350aa5371b1508f9f4528ecea23c436d94b5e8fcd4f681e30a6ac00a9704a188a03',
  },
  {
    name: 'TEST SHA(abc)',
    secretKey:
      '833fe62409237b9d62ec77587520911e9a759cec1d19755b7da901b96dca3d42',
    publicKey:
      'ec172b93ad5e563bf4932c70e1245034c35467ef2efd4d64ebf819683467e2bf',
    message:
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    signature:
      'dc2a4459e7369633a52b1bf277839a00201009a3efbf3ecb69bea2186c26b58909351fc9ac90b3ecfdfbc7c66431e0303dca179c138ac17ad9bef1177331a704',
  },
];

// X25519: RFC 7748, 6.1.
export const ALICE = {
  secretKey: '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
  publicKey: '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
};
export const BOB = {
  secretKey: '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb',
  publicKey: 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f',
};
export const SHARED_SECRET =
  '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742';

// X25519: RFC 7748, 5.2. `output` is X25519(scalar, u). `publicKey` is the scalar's own
// public key, and `sealed` the box of SHARING-8.1's scenario that the scalar seals for u
// with BOX's context, nonce and content and no salt; OpenSSL gives both. The second u has
// its top bit set, which X25519 ignores.
export const X25519_TESTS = [
  {
    name: 'first',
    scalar: 'a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4',
    u: 'e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c',
    output: 'c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552',
    publicKey:
      '1c9fd88f45606d932a80c71824ae151d15d73e77de38e8e000852e614fae7019',
    sealed:
      '01000102030405060708090a0b0c0d0e0f1011121314151617a021ddb343b5ac4627fb81a59dad919a871e69efea840a413b5669546faf50dff21344b607fde4390498f33714dd7c47',
  },
  {
    name: 'second',
    scalar: '4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d',
    u: 'e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493',
    output: '95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957',
    publicKey:
      'ff63fe57bfbf43fa3f563628b149af704d3db625369c49983650347a6a71e00e',
    sealed:
      '01000102030405060708090a0b0c0d0e0f1011121314151617bb4113dee6e0799c425c8973f940b5cbe70a567d9b8be2bc19e146faed7377159d1b18097924a880b0cb5a1ae9be208e',
  },
];
/** RFC 7748 5.2, after one iteration: X25519 of the base point 9 with itself. */
export const X25519_ONE_ITERATION = {
  secretKey: '0900000000000000000000000000000000000000000000000000000000000000',
  publicKey: '422c8e7a6227d7bca1350b3e2bb7279f7897b87bb6854b783c60e80311ae3079',
};

// A third phone, in no standard: 32 bytes counting up from 0xc0, and the X25519 public
// key OpenSSL gives for them.
export const CAROL = {
  secretKey: 'c0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedf',
  publicKey: 'dc2cca31e8e43bbd91dff7e475cca3347eb478107d5bd765aba4ae4a30c35d44',
};

// HKDF-SHA-256: RFC 5869, A.1 to A.3. `key` is the first 32 bytes of each OKM.
export const HKDF_TESTS = [
  {
    name: 'A.1',
    secret: '0b'.repeat(22),
    salt: toHex(bytesFrom(0x00, 13)),
    purpose: toHex(bytesFrom(0xf0, 10)),
    key: '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf',
  },
  {
    name: 'A.2',
    secret: toHex(bytesFrom(0x00, 80)),
    salt: toHex(bytesFrom(0x60, 80)),
    purpose: toHex(bytesFrom(0xb0, 80)),
    key: 'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c',
  },
  {
    name: 'A.3',
    secret: '0b'.repeat(22),
    salt: '',
    purpose: '',
    key: '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d',
  },
];

// The box of SHARING-8.1's scenarios, from Alice to Bob.
export const BOX = {
  label: 'shared-expense/box/v1',
  context: 'a0a1a2a3a4a5a6a7',
  nonce: '000102030405060708090a0b0c0d0e0f1011121314151617',
  plaintext: '101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f',
  salt: '505152535455565758595a5b5c5d5e5f606162636465666768696a6b6c6d6e6f',
  sealed:
    '01000102030405060708090a0b0c0d0e0f1011121314151617dddc128ed1cb022029f654454a4935c7948b28d3f64a09c0a15eb723e2cd6b40430fd540da3c06987c365f1077aafd30',
  sealedWithSalt:
    '01000102030405060708090a0b0c0d0e0f101112131415161761b3d7e611ddb3cf5578d4239d2d9d3e4d2d4e0d843b71ed1e8cad9c7d5b21ebde39f4fe2d8f662086f1a1e393d48aa0',
};

// Every 32 bytes for which X25519 gives 32 zero bytes, whatever the secret key: the seven
// points of low order, then each with its top bit set, which X25519 ignores.
export const LOW_ORDER_PUBLIC_KEYS = [
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0100000000000000000000000000000000000000000000000000000000000000',
  'e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800',
  '5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  '0000000000000000000000000000000000000000000000000000000000000080',
  '0100000000000000000000000000000000000000000000000000000000000080',
  'e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b880',
  '5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f11d7',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
];

// SHARING-12.1's scenarios: the key of each secret and purpose given as text.
export const DERIVED_FROM_TEXT: [
  secret: string,
  purpose: string,
  key: string,
][] = [
  [
    'example-link-secret',
    'example/card',
    'a5337fd9990df31b2111febc0f48a24fd4892e5fcb4cdedff0e9213f7176b799',
  ],
  [
    'example-link-secret',
    'example/request',
    '31c14db8bd56df80d7e79ff66529f475099cce47e513d4fdad8c6d47ae9ba6f0',
  ],
  [
    'example-link-secreT',
    'example/card',
    '82600dd65ee80e1cf5f9a1ee1440de88ef48b0ab8091c3c452adc63d98987539',
  ],
  [
    'Example-link-secret',
    'example/card',
    '99e4b8631a0fa8580147025637d471ea514a08a8849d909014576aef669ff836',
  ],
  [
    'example-link-secret ',
    'example/card',
    'a4bfa89d64ca61b6a41c17e466c47b501020f63a7c29214001ce41b08b0033bb',
  ],
  [
    '換機碼é',
    'example/bundle',
    '08e209d7918f22b4aba83920f3f4925c612c1f9a9ecc5efd08862d88615c26a0',
  ],
  [
    '',
    'example/card',
    '8d928ff6ef426b24d041696a57bd669f55b20c81953e9950c168afc422067761',
  ],
];

export const DERIVED = {
  /** 32 bytes counting up from 0x00, for the purpose `example/signing`. */
  fromBytes: '0034950fd14d8a2753e83477d00dd8ecd0aa4041ac51f2a4a5c84fbc49603273',
  /** `example-link-secret` for `example/card`, with BOX.salt as the salt. */
  withSalt: '2a51033a3d1bd337fe455a90b9a9574f22e11a9bc52347e5bda07f94eb64799f',
};
