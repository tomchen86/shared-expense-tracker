/**
 * What the local data keeps of this phone's device identity (ADR-0015): its device ID,
 * whether the API has answered that it is registered, and the API's time minus this
 * phone's clock. The seed is never here: it lives in the secure store.
 */
export const sharingMigrations: readonly string[] = [
  `CREATE TABLE device_identity (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    deviceId TEXT NOT NULL,
    registered INTEGER NOT NULL DEFAULT 0 CHECK (registered IN (0, 1)),
    clockOffsetMs INTEGER NOT NULL DEFAULT 0
  )`,
];
