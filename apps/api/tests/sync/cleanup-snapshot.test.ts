import { T } from '../acceptance/sharing-api';
import { bothInBrisbane } from '../acceptance/sharing-invites-api';
import { BRISBANE, download, useSyncApi } from '../acceptance/sync-api';
import {
  DAY,
  cleanUpAt,
  expectSnapshotNeeded,
  store,
} from '../acceptance/sync-cleanup-api';
import {
  expectDelivered,
  snapshotOf,
  uploadAll,
} from '../acceptance/sync-snapshot-api';

useSyncApi();

test('a download that needs a snapshot keeps it even when the cursor reaches its sequence', async () => {
  const [taylor, casey] = await bothInBrisbane();
  await store(taylor, 2);
  await cleanUpAt(T + 31 * DAY);
  const snapshot = snapshotOf(taylor, casey, { sequence: 1 });
  await uploadAll(BRISBANE, snapshot);

  expectSnapshotNeeded(await download(casey, BRISBANE, 1));
  await expectDelivered(casey, BRISBANE, snapshot);
});
