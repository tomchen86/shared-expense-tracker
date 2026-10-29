import type { SqlExecutor } from './database';

export async function createUuid(executor: SqlExecutor): Promise<string> {
  const [row] = await executor.all<{ bytes: string }>(
    'SELECT lower(hex(randomblob(16))) AS bytes',
  );
  const hex = row.bytes;
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`;
}
