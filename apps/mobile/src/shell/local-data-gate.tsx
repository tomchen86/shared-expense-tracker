import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { initializeDatabase, type Database } from '../storage';
import { applyAppearanceOption, type AppearanceOption } from '../ui/appearance';
import {
  ReduceTransparencyProvider,
  useReduceTransparencyController,
} from '../ui/reduce-transparency';
import { useThemeColors } from '../ui/theme';
import {
  ensureLocalIdentity,
  readLocalAppearance,
  saveLocalAppearance,
  saveLocalName,
  type LocalIdentity,
} from './identity';
import { appMigrations } from './migrations';

interface LocalData {
  database: Database;
  identity: LocalIdentity;
  appearance: AppearanceOption;
}

interface LocalDataContextValue extends LocalData {
  saveName: (name: string) => Promise<void>;
  saveAppearance: (appearance: AppearanceOption) => Promise<void>;
}

const LocalDataContext = createContext<LocalDataContextValue | null>(null);

export interface LocalDataGateProps {
  /** The caller closes the returned connections when the app closes. */
  openDatabase: () => Promise<Database>;
  development: boolean;
  children: ReactNode;
}

type Startup =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: LocalData };

export function LocalDataGate({
  openDatabase,
  development,
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
      const { identity, appearance } = await initializeDatabase(
        database,
        appMigrations,
        development,
        async (transaction) => ({
          identity: await ensureLocalIdentity(transaction),
          appearance: await readLocalAppearance(transaction),
        }),
      );
      await transparencyReady;
      if (!active) return;
      applyAppearanceOption(appearance);
      setStartup({
        status: 'ready',
        data: { database, identity, appearance },
      });
    }
    void open().catch(() => {
      if (active) setStartup({ status: 'error' });
    });
    return () => {
      active = false;
    };
  }, [openDatabase, development, waitUntilReady]);

  if (startup.status === 'ready') {
    const { database } = startup.data;
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
    return (
      <ReduceTransparencyProvider controller={transparency}>
        <LocalDataContext.Provider
          value={{ ...startup.data, saveName, saveAppearance }}
        >
          {children}
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
export function useSaveLocalName(): LocalDataContextValue['saveName'] {
  return useLocalData().saveName;
}
export function useAppearanceOption(): AppearanceOption {
  return useLocalData().appearance;
}
export function useSaveAppearanceOption(): LocalDataContextValue['saveAppearance'] {
  return useLocalData().saveAppearance;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
