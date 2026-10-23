// Stub for the Node implementation of the storage interface, which tests use in
// place of expo-sqlite (ADR-0006). Only tests import this file, so the app bundle
// never includes node:sqlite.

import type { Database } from './index';

/** Opens the SQLite database file at `path` with Node's built-in SQLite. */
export function openNodeDatabase(path: string): Database {
  throw new Error(`Not implemented: openNodeDatabase(${path})`);
}
