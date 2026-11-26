import {
  isEventsPageResponse,
  isGroupDevicesResponse,
  isUploadEventsRequest,
  isUploadEventsResponse,
} from './group-events';

// What the acceptance tests leave: an array with an empty slot. No JSON writes one, so
// the API never meets it, but each check says of any value whether it is the body, and
// never throws.

const EVENTS = [
  '4b1d7c2e-9a3f-4e5b-8c6d-0f1e2a3b4c5d',
  '6f2a9d1c-3b4e-4c7a-9e8f-1a2b3c4d5e6f',
  '8a3b0e2d-4c5f-4d8b-af90-2b3c4d5e6f70',
];
const TAYLOR = '0f8fad5b-d9cb-469f-a165-70867728950e';
const CONTENT = 'ab'.repeat(200);

/** `items` with the one at `index` taken out, which leaves an empty slot in its place. */
function withEmptySlot<Item>(items: readonly Item[], index: number): Item[] {
  const sparse = [...items];
  delete sparse[index];
  return sparse;
}

describe.each([0, 1, 2])('with an empty slot at %d', (slot) => {
  test('a list of events is no upload', () => {
    const events = EVENTS.map((id) => ({ id, content: CONTENT }));

    expect(isUploadEventsRequest({ epoch: 1, events })).toBe(true);
    expect(
      isUploadEventsRequest({ epoch: 1, events: withEmptySlot(events, slot) }),
    ).toBe(false);
  });

  test('a list of numbered events is no answer to an upload', () => {
    const events = EVENTS.map((id, index) => ({ id, sequence: index + 1 }));

    expect(isUploadEventsResponse({ events })).toBe(true);
    expect(
      isUploadEventsResponse({ events: withEmptySlot(events, slot) }),
    ).toBe(false);
  });

  test('a list of relayed events is no page', () => {
    const events = EVENTS.map((id, index) => ({
      id,
      sequence: index + 1,
      deviceId: TAYLOR,
      epoch: 1,
      receivedAtMs: 0,
      content: CONTENT,
    }));

    expect(isEventsPageResponse({ events, more: false })).toBe(true);
    expect(
      isEventsPageResponse({
        events: withEmptySlot(events, slot),
        more: false,
      }),
    ).toBe(false);
  });
});

test('an array of one empty slot is no list of events', () => {
  expect(isUploadEventsRequest({ epoch: 1, events: new Array(1) })).toBe(false);
  expect(isUploadEventsResponse({ events: new Array(1) })).toBe(false);
  expect(isEventsPageResponse({ events: new Array(1), more: false })).toBe(
    false,
  );
});

describe('a group devices response', () => {
  const first = { deviceId: TAYLOR, syncedAtMs: 0 };
  const second = {
    deviceId: '6f2a9d1c-3b4e-4c7a-9e8f-1a2b3c4d5e6f',
    syncedAtMs: null,
  };

  test('accepts a sorted list with a progress time or null for each device', () => {
    expect(isGroupDevicesResponse({ devices: [first, second] })).toBe(true);
  });

  test.each([
    {},
    { devices: 'none' },
    { devices: [] },
    { devices: [first], extra: true },
    { devices: [first, first] },
    { devices: [second, first] },
    { devices: [{ ...first, deviceId: 'invalid' }] },
    { devices: [{ ...first, syncedAtMs: '0' }] },
    { devices: [{ ...first, syncedAtMs: -1 }] },
    { devices: [{ ...first, extra: true }] },
  ])('rejects %j', (value) => {
    expect(isGroupDevicesResponse(value)).toBe(false);
  });
});
