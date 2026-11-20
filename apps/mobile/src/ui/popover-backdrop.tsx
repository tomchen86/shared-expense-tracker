import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Pressable, StyleSheet } from 'react-native';

type Dismiss = () => void;
const Backdrop = createContext<Dispatch<SetStateAction<Dismiss | null>> | null>(
  null,
);

/** Keep the touch target above the whole navigation stack and below its native presentations. */
export function PopoverBackdropProvider({ children }: { children: ReactNode }) {
  const [dismiss, setDismiss] = useState<Dismiss | null>(null);
  return (
    <Backdrop.Provider value={setDismiss}>
      {children}
      {dismiss && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss popover"
          style={styles.backdrop}
          onPress={dismiss}
        />
      )}
    </Backdrop.Provider>
  );
}

export function usePopoverBackdrop(
  open: boolean,
  present: (next: boolean) => void,
) {
  const setDismiss = useContext(Backdrop)!;
  useLayoutEffect(() => {
    if (!open) return;
    const dismiss = () => present(false);
    setDismiss(() => dismiss);
    return () => setDismiss((active) => (active === dismiss ? null : active));
  }, [open, present, setDismiss]);
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, zIndex: 1 },
});
