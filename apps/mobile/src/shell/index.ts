// Stubs for the shell's boundary in docs/specs/shell/spec.md. The implementer
// replaces each body; these signatures are what the acceptance tests use.
// The tests cannot see `app/_layout.tsx`: check on a phone that it wraps the
// screens in LocalDataGate with the expo-sqlite database and
// `development={__DEV__}`, and list that check in the PR's Verification.

import type { ReactElement, ReactNode } from 'react';
import type { Database } from '../storage';

/** Every capability's migrations, in the order they run (ADR-0006). */
export const appMigrations: readonly string[] = [];

/** This phone's local identity. */
export interface LocalIdentity {
  userId: string;
  personalSpaceId: string;
  personalParticipantId: string;
  name: string;
}

export interface LocalDataGateProps {
  /**
   * Opens the app's database. The gate may close a database and open it again,
   * for example to start over on a development build. The caller closes every
   * database this returned when the app closes.
   */
  openDatabase: () => Promise<Database>;
  /** Whether the app runs as a development build (`__DEV__` on the phone). */
  development: boolean;
  /** The app's screens, shown once the local data is open. */
  children: ReactNode;
}

/** Opens the local data and shows the app's screens once it is ready. */
export function LocalDataGate(props: LocalDataGateProps): ReactElement {
  throw new Error(
    `Not implemented: LocalDataGate (development: ${props.development})`,
  );
}

/** The local identity, for components inside LocalDataGate. */
export function useLocalIdentity(): LocalIdentity {
  throw new Error('Not implemented: useLocalIdentity');
}
