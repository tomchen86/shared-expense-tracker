import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { BottomNotice } from '../ui/bottom-notice';
import type { Expense } from './expenses';
import {
  deleteTrashedExpenses,
  moveExpenseToTrash,
  restoreExpense,
} from './trash';

interface TrashActions {
  move: (expense: Expense) => Promise<boolean>;
  restore: (id: string) => Promise<boolean>;
  remove: (id?: string) => Promise<boolean>;
}

const TrashContext = createContext<TrashActions | null>(null);

export function useTrashActions() {
  const actions = useContext(TrashContext);
  if (!actions) throw new Error('TrashProvider is missing');
  return actions;
}

export function TrashProvider({ children }: { children: ReactNode }) {
  const database = useLocalDatabase();
  const { personalSpaceId } = useLocalIdentity();
  const [notice, setNotice] = useState<{
    expense: Expense;
    shownAt: number;
  }>();
  const [screenReader, setScreenReader] = useState(false);
  const pending = useRef(new Set<string>());
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (enabled) => {
        changed = true;
        setScreenReader(enabled);
        setNotice((current) =>
          current ? { ...current, shownAt: Date.now() } : undefined,
        );
      },
    );
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (active && !changed) setScreenReader(enabled);
    });
    return () => {
      active = false;
      mounted.current = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const remaining =
      notice.shownAt + (screenReader ? 15000 : 5000) - Date.now();
    const timeout = setTimeout(
      () => setNotice(undefined),
      Math.max(0, remaining),
    );
    return () => clearTimeout(timeout);
  }, [notice, screenReader]);

  async function update(
    key: string,
    write: () => Promise<boolean>,
    committed: () => void,
  ) {
    // Native actions can arrive twice before React renders a disabled control.
    if (pending.current.has(key)) return false;
    pending.current.add(key);
    try {
      const changed = await write();
      if (changed && mounted.current) committed();
      return changed && mounted.current;
    } catch {
      if (mounted.current)
        Alert.alert(
          'Unable to Update Trash',
          'Your change could not be saved. Please try again.',
        );
      return false;
    } finally {
      pending.current.delete(key);
    }
  }

  function clearNotice(id?: string) {
    setNotice((current) =>
      id === undefined || current?.expense.id === id ? undefined : current,
    );
  }

  const actions: TrashActions = {
    move: (expense) =>
      update(
        expense.id,
        () => moveExpenseToTrash(database, personalSpaceId, expense.id),
        () => {
          setNotice({ expense, shownAt: Date.now() });
          AccessibilityInfo.announceForAccessibility(
            `${expense.title} moved to Trash. Undo available.`,
          );
        },
      ),
    restore: (id) =>
      update(
        id,
        () => restoreExpense(database, personalSpaceId, id),
        () => clearNotice(id),
      ),
    remove: (id) =>
      update(
        id ?? 'empty-trash',
        () => deleteTrashedExpenses(database, personalSpaceId, id),
        () => clearNotice(id),
      ),
  };

  return (
    <TrashContext.Provider value={actions}>
      {children}
      {notice && (
        <BottomNotice
          message="Moved to Trash"
          action="Undo"
          accessibilityLabel={`Undo deletion of ${notice.expense.title}`}
          onPress={() => void actions.restore(notice.expense.id)}
        />
      )}
    </TrashContext.Provider>
  );
}
