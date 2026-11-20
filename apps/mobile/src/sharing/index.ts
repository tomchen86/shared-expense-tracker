// A phone's device identity, and the requests it signs for the API
// (docs/specs/sharing/spec.md, ADR-0015). No screen is here: the features that create
// or join a shared ledger call these.
export { apiUrl } from './api-address';
export { sendApiRequest } from './api-request';
export type { ApiRequest, ApiResult } from './api-request';
export { readClockOffsetMs, readDeviceIdentity } from './device-identity';
export type { DeviceIdentity } from './device-identity';
