// Stub for the Node implementation of the storage interface, which tests use in
// place of expo-sqlite (ADR-0006). Only tests import this file, so the app bundle
// never includes node:sqlite.

import type { Database } from './index';

export interface NodeDatabaseOptions {
  /** Opens the file for reading only, so every write fails. */
  readOnly?: boolean;
}

/** Opens the SQLite database file at `path` with Node's built-in SQLite. */
export function openNodeDatabase(
  path: string,
  options: NodeDatabaseOptions = {},
): Database {
  throw new Error(
    `Not implemented: openNodeDatabase(${path}, readOnly: ${options.readOnly === true})`,
  );
}
