import type { Database } from './database';

// The phone's files, share sheet, and file picker (ADR-0020). Only this module reaches
// them, and the acceptance tests replace it, so export and import use nothing else
// from the phone. Paths are plain file system paths that SQLite can open.
//
// A stub from the spec author: the implementer writes each function.

const notImplemented = <T>(): Promise<T> =>
  Promise.reject(new Error('Not implemented'));

/** Makes a new, empty directory for temporary files and resolves with its path. */
export const createTemporaryDirectory = (): Promise<string> => notImplemented();

/** Deletes the file or directory at `path` with everything in it; a path that is not there is not an error. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const removePath = (path: string): Promise<void> => notImplemented();

/**
 * Deletes every directory `createTemporaryDirectory` made and every copy `pickFile`
 * handed out, with everything in them, whether this run of the app made them or an
 * earlier one.
 */
export const removeTemporaryFiles = (): Promise<void> => notImplemented();

/** Opens the SQLite database file at `path`, making an empty one when there is no file. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const openDatabaseFile = (path: string): Promise<Database> =>
  notImplemented();

/**
 * Opens the system share sheet for the file at `path`. Resolves once the sheet has
 * closed, whether the user shared the file or cancelled, and rejects when the sheet
 * cannot open.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const shareFile = (path: string): Promise<void> => notImplemented();

/**
 * Opens the system file picker for any kind of file. Resolves with the path of a copy
 * of the file the user picked, which the caller deletes, or with `undefined` when the
 * user cancels. The copy is among the files `removeTemporaryFiles` deletes.
 */
export const pickFile = (): Promise<string | undefined> => notImplemented();
