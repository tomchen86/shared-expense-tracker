import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import {
  LocalDataGate,
  useChartType,
  useLocalIdentity,
  useReplaceLocalData,
} from '../../src/shell';
import { useAppearanceOption } from '../../src/shell/local-data-gate';
import type { Database } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';

let directory: string;
let database: Database;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'local-data-gate-'));
  database = openNodeDatabase(join(directory, 'app.db'));
});
afterEach(async () => {
  await database.close();
  rmSync(directory, { recursive: true, force: true });
});

test('replaceData resolves and starts the inside again on the new data when onReplaced throws', async () => {
  let replaceData!: ReturnType<typeof useReplaceLocalData>;
  let mounts = 0;
  function Inside() {
    replaceData = useReplaceLocalData();
    const identity = useLocalIdentity();
    const appearance = useAppearanceOption();
    const chartType = useChartType();
    useEffect(() => {
      mounts += 1;
    }, []);
    return (
      <Text testID="inside">
        {JSON.stringify({ identity, appearance, chartType })}
      </Text>
    );
  }
  const shown = () => JSON.parse(screen.getByTestId('inside').props.children);
  const onReplaced = jest.fn(() => {
    throw new Error('The screens could not be reset');
  });
  await render(
    <LocalDataGate
      development={false}
      openDatabase={async () => database}
      onReplaced={onReplaced}
    >
      <Inside />
    </LocalDataGate>,
  );
  await screen.findByTestId('inside');
  expect(shown().identity.name).not.toBe('Taylor');
  expect(mounts).toBe(1);

  await act(async () => {
    await expect(
      replaceData(async (transaction) => {
        await transaction.run(
          `UPDATE local_identity SET userId = ?, personalSpaceId = ?, personalParticipantId = ?,
             name = ?, appearance = ?, chartType = ? WHERE singleton = 1`,
          ['user-t', 'space-t', 'participant-t', 'Taylor', 'dark', 'bar'],
        );
      }),
    ).resolves.toBeUndefined();
  });

  expect(onReplaced).toHaveBeenCalledTimes(1);
  expect(shown()).toEqual({
    identity: {
      userId: 'user-t',
      personalSpaceId: 'space-t',
      personalParticipantId: 'participant-t',
      name: 'Taylor',
    },
    appearance: 'dark',
    chartType: 'bar',
  });
  expect(mounts).toBe(2);
});
