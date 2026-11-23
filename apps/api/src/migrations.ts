import type { Migration } from './database/migrate';
import { sharingMigrations } from './sharing/migrations';
import { syncMigrations } from './sync/migrations';

/**
 * Every capability's SQL migrations, in the order they run (ADR-0007). A database records
 * each migration it ran by its place in this list, so a new one goes at the end,
 * whichever capability it belongs to, and none that has merged moves.
 */
export const migrations: readonly Migration[] = [
  sharingMigrations[0],
  syncMigrations[0],
  sharingMigrations[1],
  syncMigrations[1],
  syncMigrations[2],
  sharingMigrations[2],
<<<<<<< HEAD
  sharingMigrations[3],
=======
  syncMigrations[3],
>>>>>>> ede771979593bf3eed8a78b64844c619097f5e05
];
