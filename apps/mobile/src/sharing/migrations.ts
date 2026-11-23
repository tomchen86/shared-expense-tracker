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

/** The applicant's copy survives a restart or export, including an unacknowledged PUT. */
export const joinRequestMigration = `
  CREATE TABLE join_requests (
    position INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    secret TEXT NOT NULL,
    groupName TEXT NOT NULL,
    name TEXT NOT NULL,
    memberId TEXT,
    sent INTEGER NOT NULL DEFAULT 0 CHECK (sent IN (0, 1))
  );
`;
