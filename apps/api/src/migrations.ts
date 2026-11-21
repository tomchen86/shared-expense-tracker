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
  syncMigrations[1],
];
