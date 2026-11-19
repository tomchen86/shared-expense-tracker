import type { Migration } from './database/migrate';
import { sharingMigrations } from './sharing/migrations';

/** Every capability's SQL migrations, in the order they run (ADR-0007). */
export const migrations: readonly Migration[] = [...sharingMigrations];
