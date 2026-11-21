import {
  isInviteRefusal,
  isPutInviteResponse,
  isReadInviteResponse,
  isRevokeInviteResponse,
} from './invites';

const code = 'A'.repeat(22);
const card = 'ab'.repeat(41);

test('the phone can distinguish invite answers from malformed or unrelated replies', () => {
  const put = { code, expiresAtMs: 2000, cursor: 0 };
  expect(isPutInviteResponse(put)).toBe(true);
  expect(isPutInviteResponse({ ...put, code: 'invalid' })).toBe(false);
  expect(isPutInviteResponse({ ...put, expiresAtMs: -1 })).toBe(false);
  expect(isPutInviteResponse({ ...put, cursor: 0.5 })).toBe(false);
  expect(isPutInviteResponse({ code })).toBe(false);
  expect(isRevokeInviteResponse({ code })).toBe(true);
  expect(isRevokeInviteResponse(put)).toBe(false);
  expect(isRevokeInviteResponse({ code: 'invalid' })).toBe(false);

  const read = { expiresAtMs: 2000, card };
  expect(isReadInviteResponse(read)).toBe(true);
  expect(isReadInviteResponse({ ...read, card: 'a' })).toBe(false);
  expect(isReadInviteResponse({ ...read, expiresAtMs: '2000' })).toBe(false);
  expect(isReadInviteResponse({ ...read, code })).toBe(false);

  for (const error of [
    'no-invite',
    'invite-exists',
    'not-a-member',
    'request',
  ]) {
    expect(isInviteRefusal({ error })).toBe(true);
  }
  expect(isInviteRefusal({ error: 'replayed' })).toBe(false);
  expect(isInviteRefusal({ error: 'toString' })).toBe(false);
  expect(isInviteRefusal({ error: null })).toBe(false);
  expect(isInviteRefusal(put)).toBe(false);
});
