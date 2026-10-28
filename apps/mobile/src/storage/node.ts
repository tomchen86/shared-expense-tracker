import { DatabaseSync } from 'node:sqlite';
import { createDatabase, type Database, type SqlValue } from './database';

export interface NodeDatabaseOptions {
  /** Opens the file for reading only, so every write fails. */
  readOnly?: boolean;
}

/** Opens the SQLite database file at `path` with Node's built-in SQLite. */
export function openNodeDatabase(
  path: string,
  options: NodeDatabaseOptions = {},
): Database {
  const connection = new DatabaseSync(path, options);
  return createDatabase({
    exec: async (sql) => {
      connection.exec(sql);
    },
    run: async (sql, parameters = []) => {
      const result = connection.prepare(sql).run(...parameters);
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    all: async <T>(sql: string, parameters: readonly SqlValue[] = []) =>
      connection.prepare(sql).all(...parameters) as T[],
    close: async () => {
      connection.close();
    },
  });
}
