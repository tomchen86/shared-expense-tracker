import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderRouter } from 'expo-router/testing-library';
import { Stack } from 'expo-router';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { CategoryForm } from '../../src/categories/category-form';
import {
  ManageCategoriesScreen,
  createCategory,
  ensureDefaultCategories,
  isUncategorizedCategory,
  listCategories,
  updateCategory,
} from '../../src/categories';
import { LocalDataGate } from '../../src/shell';
import { ensureLocalIdentity } from '../../src/shell/identity';
import { appMigrations } from '../../src/shell/migrations';
import {
  initializeDatabase,
  type Database,
  type SqlValue,
} from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let directory: string;
let file: string;
let database: Database;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'categories-unit-'));
  file = join(directory, 'app.db');
  database = openNodeDatabase(file);
});

afterEach(async () => {
  await database.close();
  rmSync(directory, { recursive: true, force: true });
});

test('assigns distinct v4 UUIDs to default and created categories and skips writes on a read-only restart', async () => {
  const identity = await initializeDatabase(
    database,
    appMigrations,
    false,
    async (tx) => {
      const identity = await ensureLocalIdentity(tx);
      await ensureDefaultCategories(tx);
      return identity;
    },
  );
  const created = await createCategory(database, {
    name: 'Gym',
    color: '#43A047',
    createdByUserId: identity.userId,
    spaceId: identity.personalSpaceId,
  });
  const categories = await listCategories(database);

  const ids = categories.map((category) => category.id);
  expect(ids).toHaveLength(10);
  expect(new Set(ids).size).toBe(10);
  for (const id of ids) expect(id).toMatch(UUID_V4);
  expect(created.id).toBe(ids[9]);
  expect(categories[9]).toEqual(created);

  await database.close();
  const before = readFileSync(file);
  database = openNodeDatabase(file, { readOnly: true });
  await expect(
    initializeDatabase(database, appMigrations, false, async (tx) => {
      await ensureLocalIdentity(tx);
      await ensureDefaultCategories(tx);
    }),
  ).resolves.toBeUndefined();
  expect(await listCategories(database)).toEqual(categories);
  await database.close();
  expect(readFileSync(file)).toEqual(before);
});

test('rejects updating the reserved Uncategorized row or a missing category id', async () => {
  await initializeDatabase(database, appMigrations, false, async (tx) => {
    await ensureLocalIdentity(tx);
    await ensureDefaultCategories(tx);
  });
  const categories = await listCategories(database);
  const uncategorized = categories.find(isUncategorizedCategory)!;

  await expect(
    updateCategory(database, {
      id: uncategorized.id,
      name: 'Renamed',
      color: '#43A047',
    }),
  ).rejects.toThrow('Category cannot be updated');

  await expect(
    updateCategory(database, {
      id: 'missing-id',
      name: 'Renamed',
      color: '#43A047',
    }),
  ).rejects.toThrow('Category cannot be updated');

  expect(await listCategories(database)).toEqual(categories);
});

test('blocks modal swipe dismissal and request-close while saving, and allows them when idle', async () => {
  let finishSave!: () => void;
  const onCancel = jest.fn();
  const onSave = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  );

  render(
    <CategoryForm
      editingCategory={null}
      onCancel={onCancel}
      onSave={onSave}
      otherCategories={[]}
    />,
  );

  const modal = () =>
    screen.UNSAFE_root.find((node) => String(node.type) === 'Modal');

  expect(modal().props.allowSwipeDismissal).toBe(true);
  fireEvent(modal(), 'requestClose');
  expect(onCancel).toHaveBeenCalledTimes(1);

  onCancel.mockClear();
  fireEvent.changeText(screen.getByLabelText('Category name'), 'Gym');
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
  });

  expect(modal().props.allowSwipeDismissal).toBe(false);
  fireEvent(modal(), 'requestClose');
  expect(onCancel).not.toHaveBeenCalled();

  await act(async () => {
    finishSave();
  });

  expect(modal().props.allowSwipeDismissal).toBe(true);
  fireEvent(modal(), 'requestClose');
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test('updates the list directly after creating or editing a category without re-reading', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let failListReads = false;
  const wrappedDatabase: Database = {
    ...database,
    all: async <T,>(sql: string, parameters?: readonly SqlValue[]) => {
      if (failListReads && sql.includes('ORDER BY position ASC')) {
        throw new Error('list read failed after write');
      }
      return database.all<T>(sql, parameters);
    },
  };

  renderRouter(
    {
      _layout: () => (
        <LocalDataGate
          development={false}
          openDatabase={async () => wrappedDatabase}
        >
          <Stack />
        </LocalDataGate>
      ),
      index: ManageCategoriesScreen,
    },
    { initialUrl: '/' },
  );

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Shopping' })).toBeTruthy();
  });

  failListReads = true;

  fireEvent.press(screen.getByRole('button', { name: 'Add category' }));
  fireEvent.changeText(screen.getByLabelText('Category name'), 'Gym');
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
  });

  await waitFor(() => {
    expect(screen.queryByText('New Category')).toBeNull();
  });
  expect(alertSpy).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Gym' })).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'Shopping' }));
  fireEvent.changeText(screen.getByLabelText('Category name'), 'Groceries');
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  });

  await waitFor(() => {
    expect(screen.queryByText('Edit Category')).toBeNull();
  });
  expect(alertSpy).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Groceries' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Shopping' })).toBeNull();

  const persisted = await listCategories(database);
  expect(persisted.map((category) => category.name)).toEqual([
    'Food & Dining',
    'Transportation',
    'Groceries',
    'Entertainment',
    'Bills & Utilities',
    'Health',
    'Travel',
    'Other',
    'Uncategorized',
    'Gym',
  ]);
  alertSpy.mockRestore();
});
