import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderRouter } from 'expo-router/testing-library';
import { Stack } from 'expo-router';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { CategoryForm } from '../../src/categories/category-form';
import { createGroup, listGroups } from '../../src/groups';
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
import { categoryMigrations } from '../../src/categories/migrations';
import {
  initializeDatabase,
  type Database,
  type SqlValue,
} from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function pressFormAction(title: string, name: string) {
  const bars = screen.container.queryAll(
    (node) =>
      String(node.type) === 'RNSScreenStackHeaderConfig' &&
      node.props.title === title,
  );
  expect(bars).toHaveLength(1);
  const bar = bars[0];
  const items = [
    ...(bar.props.headerLeftBarButtonItems ?? []),
    ...(bar.props.headerRightBarButtonItems ?? []),
  ];
  const item = items.find(
    (candidate) => (candidate.accessibilityLabel || candidate.title) === name,
  );
  expect(item).toBeDefined();
  expect(item.disabled).not.toBe(true);
  await fireEvent(bar, 'pressHeaderBarButtonItem', {
    nativeEvent: { buttonId: item.buttonId },
  });
}

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
      await ensureDefaultCategories(tx, identity.personalSpaceId);
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
      const identity = await ensureLocalIdentity(tx);
      await ensureDefaultCategories(tx, identity.personalSpaceId);
    }),
  ).resolves.toBeUndefined();
  expect(await listCategories(database)).toEqual(categories);
  await database.close();
  expect(readFileSync(file)).toEqual(before);
});

test('rejects updating the reserved Uncategorized row or a missing category id', async () => {
  await initializeDatabase(database, appMigrations, false, async (tx) => {
    const identity = await ensureLocalIdentity(tx);
    await ensureDefaultCategories(tx, identity.personalSpaceId);
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

test('resets the unreleased shared-category database on development startup', async () => {
  const previousMigrations = appMigrations.map((sql) =>
    sql === categoryMigrations[0]
      ? sql.replace('spaceId TEXT NOT NULL', 'spaceId TEXT')
      : sql,
  );
  await initializeDatabase(
    database,
    previousMigrations,
    true,
    ensureLocalIdentity,
  );
  await database.run(
    "INSERT INTO categories (id, name, color, isDefault, position) VALUES ('shared', 'Shopping', '#FBC02D', 1, 1)",
  );

  const identity = await initializeDatabase(
    database,
    appMigrations,
    true,
    async (tx) => {
      const identity = await ensureLocalIdentity(tx);
      await ensureDefaultCategories(tx, identity.personalSpaceId);
      return identity;
    },
  );

  const categories = await listCategories(database);
  expect(categories).toHaveLength(9);
  expect(
    categories.every(
      (category) => category.spaceId === identity.personalSpaceId,
    ),
  ).toBe(true);
  expect(categories.some((category) => category.id === 'shared')).toBe(false);
});

test('blocks native sheet dismissal while saving, and allows it when idle', async () => {
  let finishSave!: () => void;
  const onCancel = jest.fn();
  const onSave = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  );

  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <CategoryForm
        editingCategory={null}
        onCancel={onCancel}
        onSave={onSave}
        otherCategories={[]}
      />
    </SafeAreaProvider>,
  );

  const sheet = () => {
    const sheets = screen.container.queryAll(
      (node) =>
        String(node.type) === 'RNSModalScreen' &&
        node.props.stackPresentation === 'formSheet',
    );
    expect(sheets).toHaveLength(1);
    return sheets[0];
  };

  expect(sheet().props.gestureEnabled).toBe(true);
  expect(sheet().props.preventNativeDismiss).toBe(false);
  await fireEvent(sheet(), 'dismissed', { nativeEvent: { dismissCount: 1 } });
  expect(onCancel).toHaveBeenCalledTimes(1);

  onCancel.mockClear();
  await fireEvent.changeText(screen.getByLabelText('Category name'), 'Gym');
  await act(async () => {
    await pressFormAction('New Category', 'Add');
  });

  expect(sheet().props.gestureEnabled).toBe(false);
  expect(sheet().props.preventNativeDismiss).toBe(true);
  await fireEvent(sheet(), 'dismissed', { nativeEvent: { dismissCount: 1 } });
  expect(onCancel).not.toHaveBeenCalled();

  await act(async () => {
    finishSave();
  });

  expect(sheet().props.gestureEnabled).toBe(true);
  expect(sheet().props.preventNativeDismiss).toBe(false);
  await fireEvent(sheet(), 'dismissed', { nativeEvent: { dismissCount: 1 } });
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

  await renderRouter(
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

  await pressFormAction('Manage Categories', 'Add category');
  await fireEvent.changeText(screen.getByLabelText('Category name'), 'Gym');
  await act(async () => {
    await pressFormAction('New Category', 'Add');
  });

  await waitFor(() => {
    expect(screen.queryByText('New Category')).toBeNull();
  });
  expect(alertSpy).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Gym' })).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Shopping' }));
  await fireEvent.changeText(
    screen.getByLabelText('Category name'),
    'Groceries',
  );
  await act(async () => {
    await pressFormAction('Edit Category', 'Save');
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

test.each(['matching', 'different'])(
  'ignores repeated space IDs with %s values without reloading, and saves in the personal space',
  async (values) => {
    const identity = await initializeDatabase(
      database,
      appMigrations,
      false,
      async (tx) => {
        const identity = await ensureLocalIdentity(tx);
        await ensureDefaultCategories(tx, identity.personalSpaceId);
        return identity;
      },
    );
    await createCategory(database, {
      name: 'Gym',
      color: '#43A047',
      createdByUserId: identity.userId,
      spaceId: identity.personalSpaceId,
    });
    await createGroup(database, 'Brisbane', identity);
    const [group] = await listGroups(database);
    const secondId =
      values === 'matching' ? group.id : identity.personalSpaceId;
    let categoryReads = 0;
    let groupReads = 0;
    const wrappedDatabase: Database = {
      ...database,
      all: async <T,>(sql: string, parameters?: readonly SqlValue[]) => {
        if (sql.includes('ORDER BY position ASC')) {
          categoryReads += 1;
          // Bound a broken effect loop so this regression fails without exhausting the heap.
          if (categoryReads > 2) throw new Error('Category list reloaded');
        }
        if (sql.includes('FROM groups g')) groupReads += 1;
        return database.all<T>(sql, parameters);
      },
    };

    await renderRouter(
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
      {
        initialUrl: `/?scopeKind=group&spaceId=${group.id}&spaceId=${secondId}`,
      },
    );

    expect(await screen.findByRole('button', { name: 'Gym' })).toBeTruthy();
    expect(categoryReads).toBe(1);
    expect(groupReads).toBe(0);

    await pressFormAction('Manage Categories', 'Add category');
    await fireEvent.changeText(screen.getByLabelText('Category name'), 'Pets');
    await act(async () => {
      await pressFormAction('New Category', 'Add');
    });

    expect(screen.getByRole('button', { name: 'Pets' })).toBeTruthy();
    expect(
      (await listCategories(database)).find((row) => row.name === 'Pets'),
    ).toMatchObject({
      createdByUserId: identity.userId,
      spaceId: identity.personalSpaceId,
    });
  },
);
