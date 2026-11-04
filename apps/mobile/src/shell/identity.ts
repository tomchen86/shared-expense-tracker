import type { InsightChartPreference } from '@shared-expense/domain';
import { createUuid, type SqlExecutor } from '../storage';
import type { AppearanceOption } from '../ui/appearance';

export interface LocalIdentity {
  userId: string;
  personalSpaceId: string;
  personalParticipantId: string;
  name: string;
}

export async function saveLocalName(
  database: SqlExecutor,
  name: string,
): Promise<void> {
  await database.run('UPDATE local_identity SET name = ? WHERE singleton = 1', [
    name,
  ]);
}

export async function readLocalAppearance(
  executor: SqlExecutor,
): Promise<AppearanceOption> {
  const [row] = await executor.all<{ appearance: AppearanceOption }>(
    'SELECT appearance FROM local_identity WHERE singleton = 1',
  );
  return row ? row.appearance : 'system';
}

export async function saveLocalAppearance(
  database: SqlExecutor,
  appearance: AppearanceOption,
): Promise<void> {
  await database.run(
    'UPDATE local_identity SET appearance = ? WHERE singleton = 1',
    [appearance],
  );
}

/** The chart type both Insights use (INSIGHTS-26.1). */
export async function readLocalChartType(
  executor: SqlExecutor,
): Promise<InsightChartPreference> {
  const [row] = await executor.all<{ chartType: InsightChartPreference }>(
    'SELECT chartType FROM local_identity WHERE singleton = 1',
  );
  return row ? row.chartType : 'auto';
}

export async function saveLocalChartType(
  database: SqlExecutor,
  chartType: InsightChartPreference,
): Promise<void> {
  await database.run(
    'UPDATE local_identity SET chartType = ? WHERE singleton = 1',
    [chartType],
  );
}

export async function ensureLocalIdentity(
  transaction: SqlExecutor,
): Promise<LocalIdentity> {
  const [existing] = await transaction.all<LocalIdentity>(
    'SELECT userId, personalSpaceId, personalParticipantId, name FROM local_identity WHERE singleton = 1',
  );
  if (existing) return existing;

  const ids = new Set<string>();
  while (ids.size < 3) ids.add(await createUuid(transaction));
  const [userId, personalSpaceId, personalParticipantId] = [...ids];
  await transaction.run(
    'INSERT INTO local_identity (singleton, userId, personalSpaceId, personalParticipantId, name) VALUES (1, ?, ?, ?, ?)',
    [userId, personalSpaceId, personalParticipantId, ''],
  );
  return { userId, personalSpaceId, personalParticipantId, name: '' };
}
