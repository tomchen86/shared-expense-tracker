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

/**
 * The applicant's copy survives a restart or export, including an unacknowledged PUT.
 * `outcome` is what asking the API has found since (SHARING-210.1), and nothing while the
 * request is unsent or waits. A request that was declined, or whose invite is gone, keeps
 * the group's name and nothing else (SHARING-213.1, SHARING-214.1). `copyGroupId` is the
 * copy of the invite's group this phone held when it asked, which an approval may replace
 * (SHARING-226.2).
 */
export const joinRequestMigration = `
  CREATE TABLE join_requests (
    position INTEGER PRIMARY KEY,
    code TEXT UNIQUE,
    secret TEXT,
    groupName TEXT NOT NULL,
    name TEXT,
    memberId TEXT,
    sent INTEGER NOT NULL DEFAULT 0 CHECK (sent IN (0, 1)),
    outcome TEXT CHECK (outcome IN ('choose-again', 'approved', 'declined', 'invalid')),
    copyGroupId TEXT,
    CHECK ((code IS NULL) = (outcome IS NOT NULL AND outcome IN ('declined', 'invalid'))),
    CHECK ((code IS NULL) = (secret IS NULL) AND (code IS NULL) = (name IS NULL))
  );
`;
