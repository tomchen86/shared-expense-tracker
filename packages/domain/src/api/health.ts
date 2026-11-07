/** What `GET /health` answers once the API has reached its database. */
export interface HealthResponse {
  status: 'ok';
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    value.status === 'ok'
  );
}
