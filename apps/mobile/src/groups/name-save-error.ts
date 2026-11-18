import { SyncEventTooLargeError } from '../sync/records';

export function nameSaveErrorMessage(error: unknown, kind: 'group' | 'member') {
  if (error instanceof SyncEventTooLargeError)
    return 'This name is too long to sync. Shorten it and try again.';
  return kind === 'group'
    ? 'Your group could not be saved. Please try again.'
    : 'The member could not be saved. Please try again.';
}
