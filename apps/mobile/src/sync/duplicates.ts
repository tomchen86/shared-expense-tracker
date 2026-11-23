import {
  possibleSyncDuplicates,
  type SyncDuplicateCandidate,
  type SyncUnits,
} from '@shared-expense/domain';
import { notifyExpensesChanged } from '../ledger/expenses';
import { createUuid, type Database, type SqlExecutor } from '../storage';
import { writeLocalChange, type SharedGroup } from './records';

interface DuplicateLedger extends SharedGroup {
  expenses: string;
  distinctPairs: string;
}

/** Read only the fields the rule uses, with all inputs for each ledger from one SQLite read. */
function readLedgers(tx: SqlExecutor, editableGroupId?: string) {
  return tx.all<DuplicateLedger>(
    `SELECT s.groupId, s.device,
       (SELECT json_group_array(json_object(
          'id', e.id, 'created', json(r.created), 'date', e.date,
          'amountMinor', e.amountMinor, 'currency', e.currency, 'trashed', json('false')))
        FROM sync_records r JOIN expenses e ON e.id = r.id AND e.spaceId = r.groupId
        WHERE r.groupId = s.groupId AND r.type = 'expense' AND e.trashOrder IS NULL) AS expenses,
       (SELECT json_group_array(json_extract(record, '$.units.expenses.value'))
        FROM sync_records WHERE groupId = s.groupId AND type = 'distinct') AS distinctPairs
     FROM sync_groups s JOIN groups g ON g.id = s.groupId
     ${editableGroupId === undefined ? '' : 'WHERE s.groupId = ? AND g.archived = 0'}`,
    editableGroupId === undefined ? [] : [editableGroupId],
  );
}

function pairsIn(ledger: DuplicateLedger) {
  return possibleSyncDuplicates({
    device: ledger.device,
    expenses: JSON.parse(ledger.expenses) as SyncDuplicateCandidate[],
    distinct: JSON.parse(
      ledger.distinctPairs,
    ) as SyncUnits['distinct']['expenses'][],
  });
}

/** The first (earliest) other expense for each marked expense on this phone. */
export async function readDuplicateTargets(tx: SqlExecutor) {
  const targets = new Map<string, string>();
  for (const ledger of await readLedgers(tx)) {
    for (const { id, of } of pairsIn(ledger)) {
      if (!targets.has(id)) targets.set(id, of);
    }
  }
  return targets;
}

/** Settle the displayed pair only while it is still the one the user can act on. */
export async function markExpensesDistinct(
  database: Database,
  groupId: string,
  expenseId: string,
  otherId: string,
) {
  await database.transaction(async (tx) => {
    const [group] = await readLedgers(tx, groupId);
    if (
      !group ||
      pairsIn(group).find(({ id }) => id === expenseId)?.of !== otherId
    )
      return;
    await writeLocalChange(tx, group, 'distinct', await createUuid(tx), {
      expenses: [otherId, expenseId],
    });
  });
  notifyExpensesChanged(database);
}
