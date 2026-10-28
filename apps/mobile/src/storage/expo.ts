import { openDatabaseAsync } from 'expo-sqlite';
import { createDatabase, type Database, type SqlValue } from './database';

export async function openPhoneDatabase(): Promise<Database> {
  const connection = await openDatabaseAsync('app.db', {
    useNewConnection: true,
  });
  try {
    await connection.execAsync('PRAGMA foreign_keys = ON');
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
