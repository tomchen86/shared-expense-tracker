// Stubs for the storage boundary that the shell acceptance tests use (ADR-0006).
// The implementer replaces each body and adds the rest of the interface; these
// signatures are what the tests call.

/** The app's one SQLite database, reached through the small interface in ADR-0006. */
export interface Database {
  /** Closes the connection; closing it again does nothing. Whoever opened the database closes it. */
  close(): Promise<void>;
}

/**
 * Runs the migrations that have not run yet, in order. Each migration is SQL
 * text, recorded in the database with a checksum of that text.
 */
export function runMigrations(
  database: Database,
  migrations: readonly string[],
): Promise<void> {
  throw new Error(
    `Not implemented: runMigrations(${migrations.length} migrations)`,
  );
}
