import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { InsightChartPreference } from '@shared-expense/domain';
import { ensureDefaultCategories } from '../categories/repository';
import {
  initializeDatabase,
  type Database,
  type SqlExecutor,
} from '../storage';
import { applyAppearanceOption, type AppearanceOption } from '../ui/appearance';
import {
  ReduceTransparencyProvider,
  useReduceTransparencyController,
} from '../ui/reduce-transparency';
import { useThemeColors } from '../ui/theme';
import {
  ensureLocalIdentity,
  readLocalAppearance,
  readLocalChartType,
  saveLocalAppearance,
  saveLocalChartType,
  saveLocalName,
  type LocalIdentity,
} from './identity';
import { appMigrations } from './migrations';

interface LocalData {
  database: Database;
  identity: LocalIdentity;
  appearance: AppearanceOption;
  chartType: InsightChartPreference;
}

/** What the app keeps in memory of the local data, read in the transaction that opens or replaces it. */
async function readLocalData(transaction: SqlExecutor) {
  return {
    identity: await ensureLocalIdentity(transaction),
    appearance: await readLocalAppearance(transaction),
    chartType: await readLocalChartType(transaction),
  };
}

interface LocalDataContextValue extends LocalData {
  /**
   * Runs `replace` in one transaction, then starts everything inside the gate again on
   * the data it wrote, as the app is after loading (BACKUP-14.1). A failure changes nothing.
   */
  replaceData: (
    replace: (transaction: SqlExecutor) => Promise<void>,
  ) => Promise<void>;
  saveName: (name: string) => Promise<void>;
  saveAppearance: (appearance: AppearanceOption) => Promise<void>;
  saveChartType: (chartType: InsightChartPreference) => Promise<void>;
}

const LocalDataContext = createContext<LocalDataContextValue | null>(null);

export interface LocalDataGateProps {
  /** The caller closes the returned connections when the app closes. */
  openDatabase: () => Promise<Database>;
  development: boolean;
  /** Called once `replaceData` has replaced the local data, just before everything inside starts again. */
  onReplaced?: () => void;
  /** Writes test data before the first screen shows (ADR-0018), and returns your identity after it. */
  seed?: (
    database: Database,
    identity: LocalIdentity,
  ) => Promise<LocalIdentity>;
  children: ReactNode;
}

type Startup =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: LocalData; starts: number };

export function LocalDataGate({
  openDatabase,
  development,
  onReplaced,
  seed,
  children,
}: LocalDataGateProps): ReactElement {
  const transparency = useReduceTransparencyController();
  const { waitUntilReady } = transparency;
  const colors = useThemeColors();
  const [startup, setStartup] = useState<Startup>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setStartup({ status: 'loading' });
    async function open() {
      const transparencyReady = waitUntilReady();
      const database = await openDatabase();
      if (!active) return;
      const initialized = await initializeDatabase(
        database,
        appMigrations,
        development,
        async (transaction) => {
          const data = await readLocalData(transaction);
          await ensureDefaultCategories(
            transaction,
            data.identity.personalSpaceId,
          );
          return data;
        },
      );
      const { appearance, chartType } = initialized;
      const identity = seed
        ? await seed(database, initialized.identity)
        : initialized.identity;
      await transparencyReady;
      if (!active) return;
      applyAppearanceOption(appearance);
      setStartup({
        status: 'ready',
        data: { database, identity, appearance, chartType },
        starts: 0,
      });
    }
    void open().catch(() => {
      if (active) setStartup({ status: 'error' });
    });
    return () => {
      active = false;
    };
  }, [openDatabase, development, seed, waitUntilReady]);

  if (startup.status === 'ready') {
    const { database } = startup.data;
    async function replaceData(
      replace: (transaction: SqlExecutor) => Promise<void>,
    ) {
      const data = await database.transaction(async (transaction) => {
        await replace(transaction);
        return readLocalData(transaction);
      });
      applyAppearanceOption(data.appearance);
      onReplaced?.();
      setStartup((current) =>
        current.status === 'ready' && current.data.database === database
          ? {
              status: 'ready',
              data: { database, ...data },
              starts: current.starts + 1,
            }
          : current,
      );
    }
    async function saveName(name: string) {
      await saveLocalName(database, name);
      setStartup((current) =>
        current.status === 'ready' && current.data.database === database
          ? {
              ...current,
              data: {
                ...current.data,
                identity: { ...current.data.identity, name },
              },
            }
          : current,
      );
    }
    async function saveAppearance(appearance: AppearanceOption) {
      await saveLocalAppearance(database, appearance);
      applyAppearanceOption(appearance);
      setStartup((current) =>
        current.status === 'ready' && current.data.database === database
          ? {
              ...current,
              data: {
                ...current.data,
                appearance,
              },
            }
          : current,
      );
    }
    async function saveChartType(chartType: InsightChartPreference) {
      await saveLocalChartType(database, chartType);
      setStartup((current) =>
        current.status === 'ready' && current.data.database === database
          ? { ...current, data: { ...current.data, chartType } }
          : current,
      );
    }
    return (
      <ReduceTransparencyProvider controller={transparency}>
        <LocalDataContext.Provider
          value={{
            ...startup.data,
            replaceData,
            saveName,
            saveAppearance,
            saveChartType,
          }}
        >
          {/* Everything inside keeps no state from the data that was replaced. */}
          <Fragment key={startup.starts}>{children}</Fragment>
        </LocalDataContext.Provider>
      </ReduceTransparencyProvider>
    );
  }
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      {startup.status === 'loading' ? (
        <ActivityIndicator
          accessibilityLabel="Restoring local data"
          color={colors.textMuted}
        />
      ) : (
        <>
          <Text accessibilityRole="header" style={{ color: colors.text }}>
            Unable to Load Local Data
          </Text>
          <Text style={{ color: colors.textMuted }}>
            Your data was not changed.
          </Text>
        </>
      )}
    </View>
  );
}

function useLocalData(): LocalDataContextValue {
  const data = useContext(LocalDataContext);
  if (!data)
    throw new Error('Local data is only available inside LocalDataGate');
  return data;
}

export function useLocalIdentity(): LocalIdentity {
  return useLocalData().identity;
}
export function useLocalDatabase(): Database {
  return useLocalData().database;
}
export function useReplaceLocalData(): LocalDataContextValue['replaceData'] {
  return useLocalData().replaceData;
}
export function useSaveLocalName(): LocalDataContextValue['saveName'] {
  return useLocalData().saveName;
}
export function useAppearanceOption(): AppearanceOption {
  return useLocalData().appearance;
}
export function useSaveAppearanceOption(): LocalDataContextValue['saveAppearance'] {
  return useLocalData().saveAppearance;
}
export function useChartType(): InsightChartPreference {
  return useLocalData().chartType;
}
export function useSaveChartType(): LocalDataContextValue['saveChartType'] {
  return useLocalData().saveChartType;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
