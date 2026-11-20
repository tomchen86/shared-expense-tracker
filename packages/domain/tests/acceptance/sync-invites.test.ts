import { syncRecordValues, type SyncStamp } from '../../src';
import { at, CREATED, judge, merged, refused } from './sync-fixtures';

// An invite as a record of a shared ledger (ADR-0015, ADR-0026): its ID is the invite's
// code, and its one unit, the link, holds the secret that follows `#` in the invite link
// and when the invite expires. Revoking an invite deletes the record for good.

/** 16 bytes, deadbeef…5678, as base64url without padding. */
const CODE = '3q2-7wEjRWeJq83vEjRWeA';
/** 32 bytes, 00 to 1f, as base64url without padding. */
const SECRET = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
/** 2026-11-25T06:32:00Z */
const EXPIRES = 1795588320000;

const LINK = { secret: SECRET, expiresAtMs: EXPIRES };

/** An invite's first event, or a later change to its link when `base` is given. */
const invite = (
  link: unknown = LINK,
  {
    id = CODE as unknown,
    stamp = CREATED,
    base = undefined as SyncStamp | undefined,
  } = {},
) => ({
  version: 1,
  stamp,
  type: 'invite',
  id,
  units: { link: base ? { value: link, base } : { value: link } },
});

/** The event that revokes an invite. */
const revoked = (id: unknown = CODE, stamp = at(2000)) => ({
  version: 1,
  stamp,
  type: 'invite',
  id,
  deleted: true,
});

const VALID = (content: unknown) => ({ status: 'valid', event: content });

test.each<[string, unknown]>([
  ["an invite's first event", invite()],
  ['the deletion of an invite', revoked()],
])('[SYNC-4.2] accepts %s', (_case, content) => {
  expect(judge(content)).toEqual(VALID(content));
});

test.each<[string, unknown]>([
  [
    'a unit invites do not have',
    {
      ...invite(),
      units: { link: { value: LINK }, name: { value: 'Brisbane' } },
    },
  ],
  ['an invite that changes no unit', { ...invite(), units: {} }],
])('[SYNC-4.2] refuses %s for its structure', (_case, content) => {
  expect(judge(invite())).toEqual(VALID(invite()));
  expect(judge(content)).toEqual(refused('structure'));
});

test.each<[string, unknown]>([
  ["an invite's first event", invite()],
  [
    'a later change to its link',
    invite(LINK, { stamp: at(2000), base: CREATED }),
  ],
  ['the deletion of an invite', revoked()],
  ['an invite that expires at 0', invite({ ...LINK, expiresAtMs: 0 })],
  [
    'an invite that expires at the largest time',
    invite({ ...LINK, expiresAtMs: Number.MAX_SAFE_INTEGER }),
  ],
  [
    'a secret that ends in any character 32 bytes can end in',
    invite({ ...LINK, secret: `${SECRET.slice(0, -1)}4` }),
  ],
])('[SYNC-80.1] accepts %s', (_case, content) => {
  expect(judge(content)).toEqual(VALID(content));
});

const WRONG_CODES: [string, unknown][] = [
  ['21 characters', CODE.slice(0, -1)],
  ['23 characters', `${CODE}A`],
  ['padded', `${CODE}==`],
  ['written with +', '3q2+7wEjRWeJq83vEjRWeA'],
  ['written with /', '3q2/7wEjRWeJq83vEjRWeA'],
  ['ending in a character 16 bytes cannot end in', `${CODE.slice(0, -1)}B`],
  ['a UUID', '9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8'],
];

test.each(WRONG_CODES)(
  '[SYNC-80.1] refuses an invite whose code is %s, and its deletion, for their structure',
  (_case, id) => {
    // Otherwise every invite is refused, whatever its code.
    expect(judge(invite())).toEqual(VALID(invite()));
    expect(judge(revoked())).toEqual(VALID(revoked()));

    expect(judge(invite(LINK, { id }))).toEqual(refused('structure'));
    expect(judge(revoked(id))).toEqual(refused('structure'));
  },
);

test.each<[string, unknown]>([
  ['a secret of 42 characters', { ...LINK, secret: SECRET.slice(0, -1) }],
  ['a secret of 44 characters', { ...LINK, secret: `${SECRET}A` }],
  [
    'a secret ending in a character 32 bytes cannot end in',
    { ...LINK, secret: `${SECRET.slice(0, -1)}9` },
  ],
  ['a padded secret', { ...LINK, secret: `${SECRET}=` }],
  ['a secret written with +', { ...LINK, secret: `+${SECRET.slice(1)}` }],
  ['a secret that is a number', { ...LINK, secret: 7 }],
  ['no secret', { expiresAtMs: EXPIRES }],
  ['an expiry of -1', { ...LINK, expiresAtMs: -1 }],
  ['an expiry of 1.5', { ...LINK, expiresAtMs: 1.5 }],
  [
    'an expiry past the largest whole number',
    { ...LINK, expiresAtMs: Number.MAX_SAFE_INTEGER + 1 },
  ],
  ['an expiry in text', { ...LINK, expiresAtMs: String(EXPIRES) }],
  ['no expiry', { secret: SECRET }],
  ['an extra field', { ...LINK, groupName: 'Brisbane' }],
  ['a link that is only the secret', SECRET],
  ['a link that is null', null],
])('[SYNC-80.1] refuses an invite with %s for its structure', (_case, link) => {
  expect(judge(invite())).toEqual(VALID(invite()));

  expect(judge(invite(link))).toEqual(refused('structure'));
});

test('[SYNC-80.1] an invite shows its secret and its expiry once its first event is merged', () => {
  expect(syncRecordValues(merged([invite()]))).toEqual({ link: LINK });
});

test.each<[string, unknown[]]>([
  ['after its first event', [invite(), revoked()]],
  ['before its first event', [revoked(), invite()]],
])(
  '[SYNC-80.1] a revoked invite stays revoked when its link is changed later, revoked %s',
  (_case, events) => {
    const later = invite(
      { ...LINK, expiresAtMs: EXPIRES + 1 },
      { stamp: at(3000, 0, 'phone-b'), base: CREATED },
    );

    const record = merged([...events, later]);

    expect(record).toEqual({
      type: 'invite',
      id: CODE,
      deleted: at(2000),
      units: {},
    });
    expect(syncRecordValues(record)).toBeUndefined();
  },
);
