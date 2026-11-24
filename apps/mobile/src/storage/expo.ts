import { openDatabaseAsync } from 'expo-sqlite';
import { createDatabase, type Database, type SqlValue } from './database';

/** Opens the SQLite database file `name`, in `directory` or else where the phone keeps its databases. */
export async function openExpoDatabase(
  name: string,
  directory?: string,
): Promise<Database> {
  const connection = await openDatabaseAsync(
    name,
    { useNewConnection: true },
    directory,
  );
  try {
    await connection.execAsync('PRAGMA foreign_keys = ON');
    // What is deleted is overwritten, so that it is not left in the file (SHARING-213.1).
    await connection.execAsync('PRAGMA secure_delete = ON');
  } catch (error) {
    await connection.closeAsync();
    throw error;
  }
  return createDatabase({
    exec: (sql) => connection.execAsync(sql),
    run: (sql, parameters = []) => connection.runAsync(sql, [...parameters]),
    all: <T>(sql: string, parameters: readonly SqlValue[] = []) =>
      connection.getAllAsync<T>(sql, [...parameters]),
    close: () => connection.closeAsync(),
  });
}

export const openPhoneDatabase = (): Promise<Database> =>
  openExpoDatabase('app.db');
