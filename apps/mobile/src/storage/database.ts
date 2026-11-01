export type SqlValue = string | number | null | Uint8Array;

export interface WriteResult {
  changes: number;
  lastInsertRowId: number;
}

/** SQL and bound parameters are shared by the phone and Node adapters. */
export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, parameters?: readonly SqlValue[]): Promise<WriteResult>;
  all<T>(sql: string, parameters?: readonly SqlValue[]): Promise<T[]>;
}

export interface Database extends SqlExecutor {
  /** Use and await the supplied executor for every statement in the callback. */
  transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T>;
  /** Waits for queued work; repeated closes share the same result. */
  close(): Promise<void>;
}

export interface Connection extends SqlExecutor {
  close(): Promise<void>;
}

/** One queue owns the connection, including the entire lifetime of a transaction. */
export function createDatabase(connection: Connection): Database {
  let tail = Promise.resolve();
  let closing: Promise<void> | undefined;
  let broken = false;

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    if (closing) return Promise.reject(new Error('Database is closed'));
    const result = tail.then(() => {
      if (broken)
        throw new Error('Database rollback failed; close the connection');
      return work();
    });
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return {
    exec: (sql) => enqueue(() => connection.exec(sql)),
    run: (sql, parameters) => enqueue(() => connection.run(sql, parameters)),
    all: <T>(sql: string, parameters?: readonly SqlValue[]) =>
      enqueue(() => connection.all<T>(sql, parameters)),
    transaction: <T>(work: (transaction: SqlExecutor) => Promise<T>) =>
      enqueue(async () => {
        await connection.exec('BEGIN');
        let active = true;
        let statements = Promise.resolve();
        let failed = false;
        let failure: unknown;

        function statement<R>(operation: () => Promise<R>): Promise<R> {
          if (!active)
            return Promise.reject(new Error('Transaction has ended'));
          const result = statements.then(() => {
            if (failed) throw failure;
            return operation();
          });
          statements = result.then(
            () => undefined,
            (error: unknown) => {
              failed = true;
              failure = error;
            },
          );
          return result;
        }

        const transaction: SqlExecutor = {
          exec: (sql) => statement(() => connection.exec(sql)),
          run: (sql, parameters) =>
            statement(() => connection.run(sql, parameters)),
          all: <R>(sql: string, parameters?: readonly SqlValue[]) =>
            statement(() => connection.all<R>(sql, parameters)),
        };

        try {
          const result = await work(transaction);
          active = false;
          await statements;
          if (failed) throw failure;
          await connection.exec('COMMIT');
          return result;
        } catch (error) {
          active = false;
          await statements;
          try {
            await connection.exec('ROLLBACK');
          } catch (rollbackError) {
            broken = true;
            throw new AggregateError(
              [error, rollbackError],
              'Transaction rollback failed',
              { cause: rollbackError },
            );
          }
          throw error;
        }
      }),
    close: () => {
      closing ??= tail.then(() => connection.close());
      return closing;
    },
  };
}
