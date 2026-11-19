import worker from '../src/workers';

test('the Worker serves its app-link binding without opening Hyperdrive', async () => {
  const iosAppIds = ['TEAM.com.example.app'];
  const response = await worker.fetch(
    new Request('https://example.test/.well-known/apple-app-site-association'),
    {
      APP_LINKS: { iosAppIds },
      get HYPERDRIVE(): never {
        throw new Error('The public route accessed Hyperdrive');
      },
    },
    { waitUntil: jest.fn(), passThroughOnException: jest.fn(), props: {} },
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    applinks: { details: [{ appIDs: iosAppIds }] },
  });
});
