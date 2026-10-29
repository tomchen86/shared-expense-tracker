import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import RootLayout from '../../app/_layout';
import { openPhoneDatabase } from '../../src/storage/expo';
import { openNodeDatabase } from '../../src/storage/node';
import { runMigrations, type Database } from '../../src/storage';
import { appMigrations } from '../../src/shell/migrations';

jest.mock('../../src/storage/expo', () => ({ openPhoneDatabase: jest.fn() }));
jest.mock('expo-router', () => ({
  DarkTheme: {},
  DefaultTheme: {},
  ThemeProvider: ({ children }: { children: unknown }) => children,
  Stack: function Stack() {
    const { Text } = jest.requireActual('react-native');
    const { useLocalIdentity } =
      jest.requireActual<typeof import('../../src/shell')>('../../src/shell');
    return (
      <Text testID="app-screen">{JSON.stringify(useLocalIdentity())}</Text>
    );
  },
}));

let directory: string;
let database: Database;
const open = jest.mocked(openPhoneDatabase);
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'root-layout-'));
  database = openNodeDatabase(join(directory, 'app.db'));
  open.mockReset().mockResolvedValue(database);
});
afterEach(async () => {
  await database.close();
  rmSync(directory, { recursive: true, force: true });
});

test('the root layout waits for the phone database and closes it on unmount', async () => {
  let finishOpening!: (database: Database) => void;
  open.mockReturnValue(
    new Promise((resolve) => {
      finishOpening = resolve;
    }),
  );
  const close = jest.spyOn(database, 'close');
  const view = render(<RootLayout />);
  expect(screen.getByLabelText('Restoring local data')).toBeOnTheScreen();
  expect(screen.queryByTestId('app-screen')).toBeNull();
  finishOpening(database);
  const identity = JSON.parse(
    (await screen.findByTestId('app-screen')).props.children,
  );
  expect(await database.all('SELECT userId FROM local_identity')).toEqual([
    { userId: identity.userId },
  ]);
  view.unmount();
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});

test('the root layout forwards __DEV__ and resets a mismatched development database', async () => {
  expect(__DEV__).toBe(true);
  await runMigrations(database, [
    ...appMigrations,
    'CREATE TABLE newer (id INTEGER)',
  ]);
  const view = render(<RootLayout />);
  expect(await screen.findByTestId('app-screen')).toBeOnTheScreen();
  expect(
    await database.all("SELECT name FROM sqlite_master WHERE name = 'newer'"),
  ).toEqual([]);
  view.unmount();
});

test('a pending phone connection is closed even when the layout unmounts before it opens', async () => {
  let finishOpening!: (database: Database) => void;
  open.mockReturnValue(
    new Promise((resolve) => {
      finishOpening = resolve;
    }),
  );
  const close = jest.spyOn(database, 'close');
  const view = render(<RootLayout />);
  view.unmount();
  finishOpening(database);
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});

test('Strict Mode shares one connection and does not close it while the screens are mounted', async () => {
  const close = jest.spyOn(database, 'close');
  const view = render(
    <StrictMode>
      <RootLayout />
    </StrictMode>,
  );
  expect(await screen.findByTestId('app-screen')).toBeOnTheScreen();
  expect(open).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  view.unmount();
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});

test('an open failure reaches the root error screen without rendering navigation', async () => {
  open.mockRejectedValue(new Error('device storage unavailable'));
  const view = render(<RootLayout />);
  expect(
    await screen.findByText('Unable to Load Local Data'),
  ).toBeOnTheScreen();
  expect(screen.getByText('Your data was not changed.')).toBeOnTheScreen();
  expect(screen.queryByTestId('app-screen')).toBeNull();
  view.unmount();
});
