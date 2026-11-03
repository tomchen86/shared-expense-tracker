import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalDatabase } from '../shell';
import { setGroupArchived } from './index';

/** Keep the displayed data unchanged until the archive or restore commits. */
export function useGroupArchive() {
  const database = useLocalDatabase();
  const saving = useRef(new Set<string>());
  const [pending, setPending] = useState(new Set<string>());

  async function save(id: string, archived: boolean, onSaved: () => void) {
    if (saving.current.has(id)) return;
    saving.current.add(id);
    setPending(new Set(saving.current));
    try {
      await setGroupArchived(database, id, archived);
      onSaved();
    } catch {
      Alert.alert(
        archived ? 'Unable to Archive Group' : 'Unable to Restore Group',
        archived
          ? 'The group could not be saved as archived. Please try again.'
          : 'The group could not be restored. Please try again.',
      );
    } finally {
      saving.current.delete(id);
      setPending(new Set(saving.current));
    }
  }
  return { pending, save };
}
