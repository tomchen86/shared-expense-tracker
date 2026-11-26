import { confirmsTakeover } from './group-takeover';

const applicant = '0f8fad5b-d9cb-469f-a165-70867728950e';
const first = '4b1d7c2e-9a3f-4e5b-8c6d-0f1e2a3b4c5d';
const second = '6f2a9d1c-3b4e-4c7a-9e8f-1a2b3c4d5e6f';
const sent = {
  epoch: 2,
  events: [first, second].map((id) => ({ id, content: 'ab'.repeat(41) })),
};
const events = [
  { id: first, sequence: 7 },
  { id: second, sequence: 8 },
];
const answer = { deviceId: applicant, epoch: 2, events };

test('confirms the proposed key only for the admitted device and its numbered events', () => {
  expect(confirmsTakeover(answer, applicant, sent)).toBe(true);
});

test.each([
  ['ordinary approval', { deviceId: applicant, events }],
  ['additional field', { ...answer, other: true }],
  ['first epoch', { ...answer, epoch: 1 }],
  ['different rotation', { ...answer, epoch: 3 }],
  ['different applicant', { ...answer, deviceId: second }],
  ['unnumbered event', { ...answer, events: [{ id: first }] }],
  ['partial event list', { ...answer, events: events.slice(0, 1) }],
  ['different event order', { ...answer, events: [...events].reverse() }],
])('a %s cannot confirm the takeover', (_, received) => {
  expect(confirmsTakeover(received, applicant, sent)).toBe(false);
});
