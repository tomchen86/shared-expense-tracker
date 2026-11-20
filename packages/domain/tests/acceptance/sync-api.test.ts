import {
  GROUP_REFUSAL_STATUS,
  isCreateGroupResponse,
  isEventsPageResponse,
  isGroupRefusal,
  isUploadEventsRequest,
  isUploadEventsResponse,
} from '../../src/api';

// The functions that tell whether a value is one of the event API's bodies (ADR-0007):
// the API checks each upload with the first, and a phone checks what the API answers
// with the others. A value is one only when it has exactly the keys and types of that
// body, so the tests hand them values of every kind.

const BRISBANE = '9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8';
const TAYLOR = '0f8fad5b-d9cb-469f-a165-70867728950e';
const EVENT_A = '4b1d7c2e-9a3f-4e5b-8c6d-0f1e2a3b4c5d';
const EVENT_B = '6f2a9d1c-3b4e-4c7a-9e8f-1a2b3c4d5e6f';
/** 2026-11-18T06:32:00Z. */
const T = 1794983520000;
const LARGEST_INTEGER = 9007199254740991;

/** Values that are no object with keys: what any of the functions must turn down. */
const NOT_OBJECTS: unknown[] = [
  undefined,
  null,
  true,
  0,
  1,
  '',
  'text',
  [],
  [{}],
  () => ({}),
];

/** What is no lowercase version-4 UUID. */
const NOT_IDS: unknown[] = [
  EVENT_A.toUpperCase(),
  '4b1d7c2e-9a3f-1e5b-8c6d-0f1e2a3b4c5d',
  '4b1d7c2e-9a3f-4e5b-cc6d-0f1e2a3b4c5d',
  EVENT_A.replaceAll('-', ''),
  `${EVENT_A}0`,
  EVENT_A.slice(0, -1),
  `${EVENT_A}\n`,
  ` ${EVENT_A}`,
  `{${EVENT_A}}`,
  'event-1',
  '',
  1,
  null,
  undefined,
  [EVENT_A],
];

/** What is no whole number from 1 to the largest integer a number holds exactly. */
const NOT_COUNTS: unknown[] = [
  0,
  -1,
  1.5,
  NaN,
  Infinity,
  LARGEST_INTEGER + 1,
  '1',
  null,
  undefined,
  [1],
  true,
];

/** What is no content: 1 to 65,536 bytes in lowercase hexadecimal. */
const NOT_CONTENTS: unknown[] = [
  '',
  'a',
  'abc',
  'AB',
  'aB',
  'zz',
  '0x00',
  ' 00',
  '00 ',
  '00\n',
  'AAEC',
  'AAE=',
  '00'.repeat(65_537),
  0,
  null,
  undefined,
  [0],
  new Uint8Array([0]),
];

const content = (bytes: number) => 'ab'.repeat(bytes);
/**
 * One row for each value, with how it is written as the name of its test: `test.each`
 * would hand a value that is a list over as several, and print a line feed as one.
 */
const named = (values: unknown[]): [string, unknown][] =>
  values.map((value) => [
    typeof value === 'number' || typeof value === 'function'
      ? String(value)
      : (JSON.stringify(value) ?? String(value)),
    value,
  ]);

describe('SYNC-53.1', () => {
  const upload = (events: unknown, epoch: unknown = 1) => ({ epoch, events });
  const one = (id: unknown = EVENT_A, written: unknown = content(200)) => ({
    id,
    content: written,
  });
  /** `count` events with IDs of their own. */
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      one(`${EVENT_A.slice(0, -4)}${index.toString(16).padStart(4, '0')}`),
    );

  test('[SYNC-53.1] takes an upload of one event, of several, and of 100', () => {
    expect(isUploadEventsRequest(upload([one()]))).toBe(true);
    expect(isUploadEventsRequest(upload([one(EVENT_A), one(EVENT_B)]))).toBe(
      true,
    );
    expect(isUploadEventsRequest(upload(many(100)))).toBe(true);
  });

  test('[SYNC-53.1] takes contents of 1 byte and of 65,536 bytes, of any hexadecimal digits', () => {
    expect(isUploadEventsRequest(upload([one(EVENT_A, '00')]))).toBe(true);
    expect(isUploadEventsRequest(upload([one(EVENT_A, 'ff')]))).toBe(true);
    expect(
      isUploadEventsRequest(upload([one(EVENT_A, '0123456789abcdef')])),
    ).toBe(true);
    expect(isUploadEventsRequest(upload([one(EVENT_A, content(65_536))]))).toBe(
      true,
    );
  });

  test('[SYNC-53.1] takes every key epoch from 1 to the largest integer', () => {
    for (const epoch of [1, 2, 1000, LARGEST_INTEGER]) {
      expect(isUploadEventsRequest(upload([one()], epoch))).toBe(true);
    }
  });

  test('[SYNC-53.1] takes the keys in any order', () => {
    expect(
      isUploadEventsRequest({
        events: [{ content: content(3), id: EVENT_A }],
        epoch: 1,
      }),
    ).toBe(true);
  });

  test('[SYNC-53.1] takes events with the same content under different IDs', () => {
    expect(
      isUploadEventsRequest(
        upload([one(EVENT_A, content(5)), one(EVENT_B, content(5))]),
      ),
    ).toBe(true);
  });

  test.each(named(NOT_OBJECTS))(
    '[SYNC-53.1] turns down %s as an upload',
    (_, value) => {
      expect(isUploadEventsRequest(value)).toBe(false);
    },
  );

  test('[SYNC-53.1] turns down an upload with a key missing or a key too many', () => {
    expect(isUploadEventsRequest({})).toBe(false);
    expect(isUploadEventsRequest({ epoch: 1 })).toBe(false);
    expect(isUploadEventsRequest({ events: [one()] })).toBe(false);
    expect(
      isUploadEventsRequest({ epoch: 1, events: [one()], name: 'Brisbane' }),
    ).toBe(false);
    expect(
      isUploadEventsRequest({ epoch: 1, events: [one()], groupId: BRISBANE }),
    ).toBe(false);
    expect(
      isUploadEventsRequest({ epoch: 1, events: [one()], extra: undefined }),
    ).toBe(false);
  });

  test.each(named(NOT_COUNTS))(
    '[SYNC-53.1] turns down an upload whose key epoch is %s',
    (_, epoch) => {
      expect(isUploadEventsRequest(upload([one()], epoch))).toBe(false);
    },
  );

  test('[SYNC-53.1] turns down an upload with no events, with 101, or with events that are no list', () => {
    expect(isUploadEventsRequest(upload([]))).toBe(false);
    expect(isUploadEventsRequest(upload(many(101)))).toBe(false);
    expect(isUploadEventsRequest(upload(many(1000)))).toBe(false);
    for (const events of [one(), { 0: one(), length: 1 }, 'events', 1, null]) {
      expect(isUploadEventsRequest(upload(events))).toBe(false);
    }
  });

  test('[SYNC-53.1] turns down an upload in which one event is no event', () => {
    for (const wrong of [
      ...NOT_OBJECTS,
      {},
      { id: EVENT_B },
      { content: content(3) },
      { ...one(EVENT_B), deviceId: TAYLOR },
      { ...one(EVENT_B), sequence: 1 },
      { ...one(EVENT_B), epoch: 1 },
    ]) {
      expect(isUploadEventsRequest(upload([wrong]))).toBe(false);
      expect(isUploadEventsRequest(upload([one(), wrong]))).toBe(false);
      expect(isUploadEventsRequest(upload([wrong, one()]))).toBe(false);
    }
  });

  test.each(named(NOT_IDS))(
    '[SYNC-53.1] turns down an upload with the event ID %s',
    (_, id) => {
      expect(isUploadEventsRequest(upload([one(id)]))).toBe(false);
      expect(isUploadEventsRequest(upload([one(EVENT_B), one(id)]))).toBe(
        false,
      );
    },
  );

  test('[SYNC-53.1] turns down an upload with a content that is none', () => {
    for (const written of NOT_CONTENTS) {
      expect(isUploadEventsRequest(upload([one(EVENT_A, written)]))).toBe(
        false,
      );
      expect(
        isUploadEventsRequest(upload([one(EVENT_B), one(EVENT_A, written)])),
      ).toBe(false);
    }
  });

  test('[SYNC-53.1] turns down an upload that carries one event ID twice', () => {
    expect(isUploadEventsRequest(upload([one(), one()]))).toBe(false);
    expect(
      isUploadEventsRequest(
        upload([one(EVENT_A, content(3)), one(EVENT_A, content(4))]),
      ),
    ).toBe(false);
    expect(
      isUploadEventsRequest(upload([one(EVENT_A), one(EVENT_B), one(EVENT_A)])),
    ).toBe(false);
    expect(isUploadEventsRequest(upload([...many(99), many(99)[98]]))).toBe(
      false,
    );
  });
});

describe('SYNC-62.1', () => {
  describe('what the API answers once a group is created', () => {
    test('[SYNC-62.1] is the group ID alone', () => {
      expect(isCreateGroupResponse({ groupId: BRISBANE })).toBe(true);
    });

    test('[SYNC-62.1] is nothing else', () => {
      for (const value of [
        ...NOT_OBJECTS,
        {},
        { groupId: BRISBANE, name: 'Brisbane' },
        { groupId: BRISBANE, epoch: 1 },
        { id: BRISBANE },
        ...NOT_IDS.map((groupId) => ({ groupId })),
      ]) {
        expect(isCreateGroupResponse(value)).toBe(false);
      }
    });
  });

  describe('what the API answers to an upload', () => {
    const stored = (id: unknown = EVENT_A, sequence: unknown = 1) => ({
      id,
      sequence,
    });

    test('[SYNC-62.1] is one ID and one sequence number for each event, whatever the numbers', () => {
      expect(isUploadEventsResponse({ events: [stored()] })).toBe(true);
      expect(isUploadEventsResponse({ events: [] })).toBe(true);
      expect(
        isUploadEventsResponse({
          events: [stored(EVENT_A, 7), stored(EVENT_B, 2)],
        }),
      ).toBe(true);
      expect(
        isUploadEventsResponse({ events: [stored(EVENT_A, LARGEST_INTEGER)] }),
      ).toBe(true);
    });

    test('[SYNC-62.1] is nothing else', () => {
      for (const value of [
        ...NOT_OBJECTS,
        {},
        { events: stored() },
        { events: 'events' },
        { events: [stored()], more: false },
        { events: [stored(), null] },
        { events: [{ id: EVENT_A }] },
        { events: [{ sequence: 1 }] },
        { events: [{ ...stored(), content: content(3) }] },
        ...NOT_IDS.map((id) => ({ events: [stored(id)] })),
        ...NOT_COUNTS.map((sequence) => ({
          events: [stored(EVENT_A, sequence)],
        })),
      ]) {
        expect(isUploadEventsResponse(value)).toBe(false);
      }
    });
  });

  describe('a page of events', () => {
    const relayed = (fields: Record<string, unknown> = {}) => ({
      id: EVENT_A,
      sequence: 1,
      deviceId: TAYLOR,
      epoch: 1,
      receivedAtMs: T,
      content: content(200),
      ...fields,
    });
    const without = (key: string) =>
      Object.fromEntries(
        Object.entries(relayed()).filter(([name]) => name !== key),
      );
    const page = (events: unknown, more: unknown = false) => ({ events, more });

    test('[SYNC-62.1] is a list of events, which may be empty, and whether more follow', () => {
      expect(isEventsPageResponse(page([]))).toBe(true);
      expect(isEventsPageResponse(page([], true))).toBe(true);
      expect(isEventsPageResponse(page([relayed()]))).toBe(true);
      expect(isEventsPageResponse(page([relayed()], true))).toBe(true);
    });

    test('[SYNC-62.1] has events whose sequence numbers follow one another, from any number', () => {
      expect(
        isEventsPageResponse(
          page([
            relayed({ sequence: 41 }),
            relayed({ id: EVENT_B, sequence: 42 }),
          ]),
        ),
      ).toBe(true);
      expect(
        isEventsPageResponse(
          page([
            relayed({ sequence: 41 }),
            relayed({ id: EVENT_B, sequence: 43 }),
          ]),
        ),
      ).toBe(false);
      expect(
        isEventsPageResponse(
          page([
            relayed({ sequence: 42 }),
            relayed({ id: EVENT_B, sequence: 41 }),
          ]),
        ),
      ).toBe(false);
      expect(
        isEventsPageResponse(
          page([
            relayed({ sequence: 41 }),
            relayed({ id: EVENT_B, sequence: 41 }),
          ]),
        ),
      ).toBe(false);
    });

    test('[SYNC-62.1] takes every value an event can be relayed with', () => {
      for (const fields of [
        { sequence: LARGEST_INTEGER },
        { epoch: 2 },
        { epoch: LARGEST_INTEGER },
        { receivedAtMs: 0 },
        { receivedAtMs: LARGEST_INTEGER },
        { content: '00' },
        { content: content(65_536) },
        { deviceId: EVENT_B },
      ]) {
        expect(isEventsPageResponse(page([relayed(fields)]))).toBe(true);
      }
    });

    test('[SYNC-62.1] is nothing else', () => {
      for (const value of [
        ...NOT_OBJECTS,
        {},
        { events: [] },
        { more: false },
        { events: [], more: false, cursor: 0 },
        page(relayed()),
        page('events'),
        page([], 'false'),
        page([], 0),
        page([], null),
        page([relayed(), null]),
      ]) {
        expect(isEventsPageResponse(value)).toBe(false);
      }
    });

    test('[SYNC-62.1] has no event with a key missing, a key too many, or a value of another kind', () => {
      const wrong: unknown[] = [
        ...[
          'id',
          'sequence',
          'deviceId',
          'epoch',
          'receivedAtMs',
          'content',
        ].map(without),
        relayed({ groupId: BRISBANE }),
        relayed({ size: 200 }),
        ...NOT_IDS.map((id) => relayed({ id })),
        ...NOT_IDS.map((deviceId) => relayed({ deviceId })),
        ...NOT_COUNTS.map((sequence) => relayed({ sequence })),
        ...NOT_COUNTS.map((epoch) => relayed({ epoch })),
        ...NOT_CONTENTS.map((written) => relayed({ content: written })),
        ...[-1, 1.5, NaN, Infinity, LARGEST_INTEGER + 1, '0', null].map(
          (receivedAtMs) => relayed({ receivedAtMs }),
        ),
      ];
      for (const each of wrong) {
        expect(isEventsPageResponse(page([each]))).toBe(false);
      }
    });
  });

  describe("one of the event API's own refusals", () => {
    test('[SYNC-62.1] is its reason, and for a key epoch also the epoch of the group; each has its status', () => {
      expect(isGroupRefusal({ error: 'not-a-member' })).toBe(true);
      expect(isGroupRefusal({ error: 'group-full' })).toBe(true);
      expect(isGroupRefusal({ error: 'epoch', epoch: 1 })).toBe(true);
      expect(isGroupRefusal({ error: 'epoch', epoch: LARGEST_INTEGER })).toBe(
        true,
      );
      expect(GROUP_REFUSAL_STATUS).toEqual({
        'not-a-member': 403,
        epoch: 409,
        'group-full': 413,
      });
    });

    test('[SYNC-62.1] is nothing else', () => {
      for (const value of [
        ...NOT_OBJECTS,
        {},
        { error: 'epoch' },
        { error: 'not-a-member', epoch: 1 },
        { error: 'group-full', epoch: 1 },
        { error: 'not-a-member', groupId: BRISBANE },
        { error: 'epoch', epoch: 1, serverTimeMs: T },
        { error: 'not-a-member ' },
        { error: 'Not-A-Member' },
        { error: 'request' },
        { error: 'signature' },
        { error: 'clock', serverTimeMs: T },
        { error: 1 },
        { reason: 'not-a-member' },
        ...NOT_COUNTS.map((epoch) => ({ error: 'epoch', epoch })),
      ]) {
        expect(isGroupRefusal(value)).toBe(false);
      }
    });
  });
});
