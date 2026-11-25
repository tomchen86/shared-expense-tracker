import { T, setTime } from '../acceptance/sharing-api';
import {
  caseyAsksWithDanaIn,
  caseyForDana,
  expectTakenOver,
  takeOver,
} from '../acceptance/sharing-takeover-api';
import {
  BRISBANE,
  download,
  event,
  expectPage,
  expectUploaded,
  relayed,
  upload,
  useSyncApi,
} from '../acceptance/sync-api';

useSyncApi();

test('a takeover carrying only a known event rotates without renumbering or replacing the event', async () => {
  const world = await caseyAsksWithDanaIn();
  const { taylor, dana, casey } = world;
  const original = event();
  expectUploaded(await upload(dana, BRISBANE, [original]), [original], [1]);
  setTime(T + 1_000);
  const takeover = caseyForDana(world, {
    cursor: 1,
    events: [event(41, original.id)],
  });

  expectTakenOver(
    await takeOver(taylor, BRISBANE, casey, takeover),
    casey,
    takeover,
    [1],
  );
  expectPage(await download(casey, BRISBANE, 0), {
    events: [relayed(original, { sequence: 1, by: dana, at: T })],
    more: false,
  });
  const next = event();
  expectUploaded(await upload(casey, BRISBANE, [next], 2), [next], [2]);
});
