// A phone's device identity, and the requests it signs for the API
// (docs/specs/sharing/spec.md, ADR-0015). No screen is here: the features that create
// or join a shared ledger call these.
export { apiUrl } from './api-address';
export { sendApiRequest } from './api-request';
export type { ApiRequest, ApiResult } from './api-request';
export {
  readClockOffsetMs,
  readCorrectedTime,
  readDeviceIdentity,
  SEED_OPTIONS,
} from './device-identity';
export type { DeviceIdentity } from './device-identity';
// Inviting, asking to join and answering a request, for callers outside this folder.
export { prepareInvite, type InviteResult } from './invites';
export {
  sendJoinRequest,
  listJoinRequests,
  type JoinRequest,
} from './join-requests';
export {
  approveJoinRequest,
  askJoinResult,
  listReceivedJoinRequests,
  rejectJoinRequest,
  type ApproveResult,
  type CannotApprove,
  type JoinResult,
  type ReceivedJoinRequest,
  type RejectResult,
} from './join-decisions';
