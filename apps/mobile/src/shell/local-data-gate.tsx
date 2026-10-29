import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ensureDefaultCategories } from '../categories/repository';
import { initializeDatabase, type Database } from '../storage';
import {
  ensureLocalIdentity,
  saveLocalName,
  type LocalIdentity,
} from './identity';
import { appMigrations } from './migrations';

interface LocalData {
  database: Database;
  identity: LocalIdentity;
}

interface LocalDataContextValue extends LocalData {
  saveName: (name: string) => Promise<void>;
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
  const [startup, setStartup] = useState<Startup>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setStartup({ status: 'loading' });
    async function open() {
      const database = await openDatabase();
      if (!active) return;
      const identity = await initializeDatabase(
        database,
        appMigrations,
        development,
        async (transaction) => {
          const localIdentity = await ensureLocalIdentity(transaction);
          await ensureDefaultCategories(transaction);
          return localIdentity;
        },
      );
      if (active) setStartup({ status: 'ready', data: { database, identity } });
    }
    void open().catch(() => {
      if (active) setStartup({ status: 'error' });
    });
    return () => {
      active = false;
    };
  }, [openDatabase, development]);

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
    return (
      <LocalDataContext.Provider value={{ ...startup.data, saveName }}>
        {children}
      </LocalDataContext.Provider>
    );
  }
  return (
    <View style={styles.center}>
      {startup.status === 'loading' ? (
        <ActivityIndicator accessibilityLabel="Restoring local data" />
      ) : (
        <>
          <Text accessibilityRole="header">Unable to Load Local Data</Text>
          <Text>Your data was not changed.</Text>
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
