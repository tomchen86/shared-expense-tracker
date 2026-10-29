import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AccessibilityInfo } from 'react-native';

export interface ReduceTransparencyController {
  waitUntilReady: () => Promise<void>;
}

interface InternalController extends ReduceTransparencyController {
  getSnapshot: () => boolean;
  subscribe: (listener: () => void) => () => void;
}

const ReduceTransparencyContext = createContext(true);

export function useReduceTransparencyController(): ReduceTransparencyController {
  const storeRef = useRef<
    | (InternalController & {
        setFromEvent: (next: boolean) => void;
      })
    | null
  >(null);

  if (!storeRef.current) {
    let enabled = true;
    let changed = false;
    let readyPromise: Promise<void> | null = null;
    const listeners = new Set<() => void>();
    const notify = () => {
      for (const listener of listeners) listener();
    };

    storeRef.current = {
      getSnapshot: () => enabled,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      setFromEvent: (next) => {
        changed = true;
        if (enabled !== next) {
          enabled = next;
          notify();
        }
      },
      waitUntilReady: () => {
        readyPromise ??= AccessibilityInfo.isReduceTransparencyEnabled().then(
          (value) => {
            if (!changed && enabled !== value) {
              enabled = value;
              notify();
            }
          },
          () => {},
        );
        return readyPromise;
      },
    };
  }

  const store = storeRef.current;

  useEffect(() => {
    void store.waitUntilReady();
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      store.setFromEvent,
    );
    return () => {
      subscription.remove();
    };
  }, [store]);

  return store;
}

export function ReduceTransparencyProvider({
  controller,
  children,
}: {
  controller: ReduceTransparencyController;
  children: ReactNode;
}) {
  const internal = controller as InternalController;
  const enabled = useSyncExternalStore(
    internal.subscribe,
    internal.getSnapshot,
  );
  return (
    <ReduceTransparencyContext.Provider value={enabled}>
      {children}
    </ReduceTransparencyContext.Provider>
  );
}

export function useReduceTransparency(): boolean {
  return useContext(ReduceTransparencyContext);
}
