// Stubs for the shell's boundary in docs/specs/shell/spec.md. The implementer
// replaces each body; these signatures are what the acceptance tests use.

import type { ReactElement, ReactNode } from 'react';
import type { Database } from '../storage';

/** This phone's local identity. */
export interface LocalIdentity {
  userId: string;
  personalSpaceId: string;
  personalParticipantId: string;
  name: string;
}

export interface LocalDataGateProps {
  /** Opens the app's database. The gate does not close it. */
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
