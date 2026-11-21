import {
  GROUP_SNAPSHOT_LIMIT,
  SNAPSHOT_CHUNK_COUNT_LIMIT,
  SNAPSHOT_CHUNK_LIMIT,
  SNAPSHOT_CHUNK_MINIMUM,
  SNAPSHOT_REFUSAL_STATUS,
  isSnapshotChunkResponse,
  isSnapshotChunkStoredResponse,
  isSnapshotRefusal,
  isSnapshotResponse,
  isUploadSnapshotChunkRequest,
} from '../../src/api';

// The bodies of the snapshot API (ADR-0028): what a phone uploads for one chunk, and what
// the API answers. The phone and the API both judge them with these functions.

const SNAPSHOT = '2d0f6c4a-91b7-4e5c-8a3d-6f1e2b7c9d04';
const TAYLOR = '0f8fad5b-d9cb-469f-a165-70867728950e';
const CASEY = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

/** `bytes` bytes, in lowercase hexadecimal. */
const hex = (bytes: number) => 'ab'.repeat(bytes);

const without = (value: object, key: string) =>
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));

/** A wrong way to write an ID, with what is wrong with it. */
const WRONG_IDS: [string, unknown][] = [
  ['in capitals', CASEY.toUpperCase()],
  ['of version 1', '7c9e6679-7425-10de-944b-e07fc1f90ae7'],
  ['with no hyphens', CASEY.replaceAll('-', '')],
  ['that is a number', 7],
  ['that is empty', ''],
];

describe('SYNC-100.1', () => {
  test('[SYNC-100.1] the limits are 41 to 262,144 bytes a chunk, 64 chunks a snapshot and 16 MiB a group', () => {
    expect(SNAPSHOT_CHUNK_MINIMUM).toBe(41);
    expect(SNAPSHOT_CHUNK_LIMIT).toBe(262_144);
    expect(SNAPSHOT_CHUNK_COUNT_LIMIT).toBe(64);
    expect(GROUP_SNAPSHOT_LIMIT).toBe(16_777_216);
    // The judgements hold a chunk and a snapshot to the same numbers.
    expect(
      isSnapshotChunkResponse({ content: hex(SNAPSHOT_CHUNK_MINIMUM) }),
    ).toBe(true);
    expect(
      isSnapshotChunkResponse({ content: hex(SNAPSHOT_CHUNK_LIMIT + 1) }),
    ).toBe(false);
    expect(
      isSnapshotChunkStoredResponse({
        snapshotId: SNAPSHOT,
        index: SNAPSHOT_CHUNK_COUNT_LIMIT - 1,
      }),
    ).toBe(true);
  });

  const upload = {
    deviceId: CASEY,
    epoch: 1,
    sequence: 0,
    count: 1,
    content: hex(41),
  };

  test.each<[string, unknown]>([
    ['the smallest', upload],
    [
      'the largest',
      {
        deviceId: CASEY,
        epoch: Number.MAX_SAFE_INTEGER,
        sequence: Number.MAX_SAFE_INTEGER,
        count: 64,
        content: hex(262_144),
      },
    ],
    [
      'its fields in another order',
      {
        content: hex(200),
        count: 3,
        sequence: 5,
        epoch: 2,
        deviceId: CASEY,
      },
    ],
  ])('[SYNC-100.1] takes %s upload of a chunk', (_case, value) => {
    expect(isUploadSnapshotChunkRequest(value)).toBe(true);
  });

  test.each<[string, unknown]>([
    ['null', null],
    ['a text', JSON.stringify(upload)],
    ['an array', [upload]],
    ['one with no device ID', without(upload, 'deviceId')],
    ['one with no key epoch', without(upload, 'epoch')],
    ['one with no sequence number', without(upload, 'sequence')],
    ['one with no count', without(upload, 'count')],
    ['one with no content', without(upload, 'content')],
    ['one with a snapshot ID', { ...upload, snapshotId: SNAPSHOT }],
    ['one with an index', { ...upload, index: 0 }],
    ['one with a name', { ...upload, name: 'Brisbane' }],
    ...WRONG_IDS.map(([what, deviceId]): [string, unknown] => [
      `one with a device ID ${what}`,
      { ...upload, deviceId },
    ]),
    ['one with key epoch 0', { ...upload, epoch: 0 }],
    ['one with key epoch 1.5', { ...upload, epoch: 1.5 }],
    ['one with key epoch "1"', { ...upload, epoch: '1' }],
    ['one with sequence number -1', { ...upload, sequence: -1 }],
    ['one with sequence number 1.5', { ...upload, sequence: 1.5 }],
    [
      'one with sequence number 2^53',
      { ...upload, sequence: Number.MAX_SAFE_INTEGER + 1 },
    ],
    ['one with sequence number "0"', { ...upload, sequence: '0' }],
    ['one with count 0', { ...upload, count: 0 }],
    ['one with count 65', { ...upload, count: 65 }],
    ['one with count 1.5', { ...upload, count: 1.5 }],
    ['one with count "3"', { ...upload, count: '3' }],
    ['one with empty content', { ...upload, content: '' }],
    ['one with 40 bytes', { ...upload, content: hex(40) }],
    ['one with 262,145 bytes', { ...upload, content: hex(262_145) }],
    ['one with content in capitals', { ...upload, content: 'AB'.repeat(41) }],
    [
      'one with an odd number of characters',
      { ...upload, content: `${hex(41)}a` },
    ],
    [
      'one with content in Base64',
      { ...upload, content: Buffer.alloc(60, 1).toString('base64') },
    ],
    ['one with content that is no text', { ...upload, content: [171, 171] }],
  ])('[SYNC-100.1] does not take %s for the upload of a chunk', (_c, value) => {
    expect(isUploadSnapshotChunkRequest(value)).toBe(false);
  });

  test.each<[string, unknown, boolean]>([
    ['index 0', { snapshotId: SNAPSHOT, index: 0 }, true],
    ['index 63', { snapshotId: SNAPSHOT, index: 63 }, true],
    ['index -1', { snapshotId: SNAPSHOT, index: -1 }, false],
    ['index 64', { snapshotId: SNAPSHOT, index: 64 }, false],
    ['index 1.5', { snapshotId: SNAPSHOT, index: 1.5 }, false],
    ['index "0"', { snapshotId: SNAPSHOT, index: '0' }, false],
    ...WRONG_IDS.map(([what, snapshotId]): [string, unknown, boolean] => [
      `a snapshot ID ${what}`,
      { snapshotId, index: 0 },
      false,
    ]),
    ['no index', { snapshotId: SNAPSHOT }, false],
    ['no snapshot ID', { index: 0 }, false],
    [
      'the content beside',
      { snapshotId: SNAPSHOT, index: 0, content: hex(41) },
      false,
    ],
    ['a text in its place', 'stored', false],
    ['null in its place', null, false],
  ])(
    '[SYNC-100.1] judges the answer that a chunk is stored, with %s',
    (_case, value, is) => {
      expect(isSnapshotChunkStoredResponse(value)).toBe(is);
    },
  );

  const waiting = {
    snapshotId: SNAPSHOT,
    deviceId: TAYLOR,
    epoch: 1,
    sequence: 0,
    count: 1,
  };

  test.each<[string, unknown, boolean]>([
    ['the smallest numbers', waiting, true],
    [
      'the largest numbers',
      {
        ...waiting,
        epoch: 2,
        sequence: Number.MAX_SAFE_INTEGER,
        count: 64,
      },
      true,
    ],
    ['no snapshot ID', without(waiting, 'snapshotId'), false],
    ['no device ID', without(waiting, 'deviceId'), false],
    ['no key epoch', without(waiting, 'epoch'), false],
    ['no sequence number', without(waiting, 'sequence'), false],
    ['no count', without(waiting, 'count'), false],
    ['the recipient beside', { ...waiting, recipientId: CASEY }, false],
    ['a content beside', { ...waiting, content: hex(41) }, false],
    ...WRONG_IDS.flatMap(([what, id]): [string, unknown, boolean][] => [
      [`a snapshot ID ${what}`, { ...waiting, snapshotId: id }, false],
      [`a device ID ${what}`, { ...waiting, deviceId: id }, false],
    ]),
    ['key epoch 0', { ...waiting, epoch: 0 }, false],
    ['sequence number -1', { ...waiting, sequence: -1 }, false],
    ['count 0', { ...waiting, count: 0 }, false],
    ['count 65', { ...waiting, count: 65 }, false],
    ['an array in its place', [waiting], false],
  ])(
    '[SYNC-100.1] judges the answer that says which snapshot waits, with %s',
    (_case, value, is) => {
      expect(isSnapshotResponse(value)).toBe(is);
    },
  );

  test.each<[string, unknown, boolean]>([
    ['41 bytes', { content: hex(41) }, true],
    ['262,144 bytes', { content: hex(262_144) }, true],
    ['40 bytes', { content: hex(40) }, false],
    ['262,145 bytes', { content: hex(262_145) }, false],
    ['content in capitals', { content: 'AB'.repeat(41) }, false],
    ['content that is no text', { content: 41 }, false],
    ['an index beside', { content: hex(41), index: 0 }, false],
    ['nothing', {}, false],
    ['a text in its place', hex(41), false],
  ])('[SYNC-100.1] judges a chunk’s answer with %s', (_case, value, is) => {
    expect(isSnapshotChunkResponse(value)).toBe(is);
  });

  test('[SYNC-100.1] takes the two refusals of its own, with status 404 and 413', () => {
    expect(isSnapshotRefusal({ error: 'no-snapshot' })).toBe(true);
    expect(isSnapshotRefusal({ error: 'snapshots-full' })).toBe(true);
    expect(SNAPSHOT_REFUSAL_STATUS).toEqual({
      'no-snapshot': 404,
      'snapshots-full': 413,
    });
  });

  test.each<[string, unknown]>([
    [
      'a refusal with one field more',
      { error: 'no-snapshot', snapshotId: SNAPSHOT },
    ],
    ['the event API’s not-a-member', { error: 'not-a-member' }],
    ['the event API’s epoch', { error: 'epoch', epoch: 1 }],
    ['the event API’s group-full', { error: 'group-full' }],
    ['sharing’s request', { error: 'request' }],
    ['a reason in other letters', { error: 'No-Snapshot' }],
    ['a reason with a space after it', { error: 'snapshots-full ' }],
    ['a text', 'no-snapshot'],
    ['null', null],
  ])('[SYNC-100.1] does not take %s for a refusal of its own', (_c, value) => {
    expect(isSnapshotRefusal(value)).toBe(false);
  });
});
