import { isHealthResponse } from './health';

test('accepts what the API answers', () => {
  expect(isHealthResponse({ status: 'ok' })).toBe(true);
});

test.each([[null], ['ok'], [{}], [{ status: 'down' }]])(
  'rejects %j',
  (value) => {
    expect(isHealthResponse(value)).toBe(false);
  },
);
