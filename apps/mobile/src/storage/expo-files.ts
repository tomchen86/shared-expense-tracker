import { getDocumentAsync } from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import type { Database } from './database';
import { openExpoDatabase } from './expo';

// The phone's files, share sheet, and file picker (ADR-0020). Only this module reaches
// them, and the acceptance tests replace it, so export and import use nothing else
// from the phone. Paths are plain file system paths that SQLite can open.

/** Where `createTemporaryDirectory` makes its directories, under the phone's cache. */
const OWN = 'Backup';
// ponytail: the directory expo-document-picker 58 copies into, on iOS and Android, which
// it does not export. If an upgrade renames it, a copy left by an app that was ended
// mid-import stays until the system clears the cache; move the copy on pick then.
const PICKED = 'DocumentPicker';

const toUri = (path: string) =>
  `file://${path.split('/').map(encodeURIComponent).join('/')}`;
const toPath = (uri: string) =>
  decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '');

let made = 0;

/** Makes a new, empty directory for temporary files and resolves with its path. */
export async function createTemporaryDirectory(): Promise<string> {
  const directory = new Directory(Paths.cache, OWN, `${Date.now()}-${made++}`);
  directory.create({ intermediates: true });
  return toPath(directory.uri);
}

/** Deletes the file or directory at `path` with everything in it; a path that is not there is not an error. */
export async function removePath(path: string): Promise<void> {
  const uri = toUri(path);
  const { exists, isDirectory } = Paths.info(uri);
  if (exists) (isDirectory ? new Directory(uri) : new File(uri)).delete();
}

/**
 * Deletes every directory `createTemporaryDirectory` made and every copy `pickFile`
 * handed out, with everything in them, whether this run of the app made them or an
 * earlier one.
 */
export async function removeTemporaryFiles(): Promise<void> {
  for (const name of [OWN, PICKED]) {
    const directory = new Directory(Paths.cache, name);
    if (directory.exists) directory.delete();
  }
}

/** Opens the SQLite database file at `path`, making an empty one when there is no file. */
export function openDatabaseFile(path: string): Promise<Database> {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return openExpoDatabase(name, path.slice(0, -name.length - 1));
}

/**
 * Opens the system share sheet for the file at `path`. Resolves once the sheet has
 * closed, whether the user shared the file or cancelled, and rejects when the sheet
 * cannot open.
 */
export const shareFile = (path: string): Promise<void> =>
  shareAsync(toUri(path));

/**
 * Opens the system file picker for any kind of file. Resolves with the path of a copy
 * of the file the user picked, which the caller deletes, or with `undefined` when the
 * user cancels. The copy is among the files `removeTemporaryFiles` deletes.
 */
export async function pickFile(): Promise<string | undefined> {
  const picked = await getDocumentAsync({ copyToCacheDirectory: true });
  return picked.canceled ? undefined : toPath(picked.assets[0].uri);
}
