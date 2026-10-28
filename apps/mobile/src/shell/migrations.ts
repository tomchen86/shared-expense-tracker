/** Every capability's SQL migrations, in the order they run (ADR-0006). */
export const appMigrations: readonly string[] = [
  `CREATE TABLE local_identity (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    userId TEXT NOT NULL,
    personalSpaceId TEXT NOT NULL,
    personalParticipantId TEXT NOT NULL,
    name TEXT NOT NULL,
    CHECK (userId <> personalSpaceId AND userId <> personalParticipantId AND personalSpaceId <> personalParticipantId)
  )`,
];
