import { T, setTime, sql } from '../acceptance/sharing-api';
import {
  CODE_A,
  CODE_B,
  NO_INVITE,
  WEEK,
  card,
  expectCard,
  expectInvite,
  expectInviteRefused,
  expectRevoked,
  putInvite,
  readInvite,
  revokeInvite,
  taylorWithBrisbaneAndCasey,
} from '../acceptance/sharing-invites-api';
import {
  BRISBANE,
  TOKYO,
  createGroup,
  expectCreated,
  hexOf,
  useSyncApi,
} from '../acceptance/sync-api';

useSyncApi();

test('two groups claiming one new code can store only the winning card', async () => {
  const [taylor, casey] = await taylorWithBrisbaneAndCasey();
  expectCreated(await createGroup(casey, TOKYO), TOKYO);
  const claims = [
    { group: BRISBANE, phone: taylor, content: card() },
    { group: TOKYO, phone: casey, content: card() },
  ];
  const answers = await Promise.all(
    claims.map(({ group, phone, content }) =>
      putInvite(phone, group, CODE_A, content),
    ),
  );
  expect(answers.map(({ status }) => status).sort()).toEqual([200, 404]);
  const winner = answers.findIndex(({ status }) => status === 200);
  expectInvite(answers[winner], CODE_A, T + WEEK);
  expectInviteRefused(answers[1 - winner], NO_INVITE);
  expectCard(
    await readInvite(taylor, CODE_A),
    T + WEEK,
    claims[winner].content,
  );

  const stored = () => sql()`
    SELECT code, group_id, revoked, encode(card, 'hex') AS card, cursor FROM group_invites`;
  const { group, phone, content } = claims[winner];
  const row = {
    code: CODE_A,
    group_id: group,
    revoked: false,
    card: hexOf(content),
    cursor: '0',
  };
  expect(await stored()).toEqual([row]);

  const replacement = card();
  expectInvite(
    await putInvite(phone, group, CODE_A, replacement),
    CODE_A,
    T + WEEK,
  );
  expect(await stored()).toEqual([{ ...row, card: hexOf(replacement) }]);

  expectRevoked(await revokeInvite(phone, group, CODE_A), CODE_A);
  expect(await stored()).toEqual([
    { ...row, revoked: true, card: null, cursor: null },
  ]);
  expectInviteRefused(await readInvite(taylor, CODE_A), NO_INVITE);
});

test('a replaced expired card stays unreadable on a server whose clock is a millisecond behind', async () => {
  const [phone] = await taylorWithBrisbaneAndCasey();
  const expires = T + WEEK;
  expectInvite(
    await putInvite(phone, BRISBANE, CODE_A, card()),
    CODE_A,
    expires,
  );
  setTime(expires);
  const next = card();
  expectInvite(
    await putInvite(phone, BRISBANE, CODE_B, next),
    CODE_B,
    expires + WEEK,
  );

  setTime(expires - 1);
  expectInviteRefused(await readInvite(phone, CODE_A), NO_INVITE);
  expectCard(await readInvite(phone, CODE_B), expires + WEEK, next);
  expect(
    await sql()`SELECT revoked, card, cursor FROM group_invites WHERE code = ${CODE_A}`,
  ).toEqual([{ revoked: false, card: null, cursor: null }]);
});
