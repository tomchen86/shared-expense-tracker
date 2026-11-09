import { isHealthResponse } from '@shared-expense/domain/api';
import { startServer } from '../src/node';
import { useApi } from './support/api';

describe('with its database', () => {
  const api = useApi();

  test('GET /health answers ok', async () => {
    const response = await api.fetch('/health');
    expect(response.status).toBe(200);
    expect(isHealthResponse(await response.json())).toBe(true);
  });
});

test('GET /health fails when the database cannot be reached', async () => {
  const server = await startServer({
    databaseUrl: 'postgres://postgres:postgres@127.0.0.1:1/postgres',
  });
  try {
    const response = await fetch(`${server.url}/health`);
    expect(response.status).toBe(500);
  } finally {
    await server.close();
  }
});
