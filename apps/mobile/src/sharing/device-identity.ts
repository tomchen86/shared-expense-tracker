import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import {
  boxPublicKey,
  deriveKey,
  sign,
  signingPublicKey,
} from '@shared-expense/domain/crypto';
import { getRandomValues, randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { SqlExecutor } from '../storage';

// Where this phone's device identity lives (ADR-0015): the device ID in the local data,
// and the seed in the secure store, under an entry named after the device ID. Nothing here
// is kept in memory between calls, so an import that replaces the local data is seen at
// once.

/** What this phone has to show the API. */
export type DeviceIdentity =
  /** The phone has never needed the API. */
  | { status: 'none' }
  /** The local data has a device ID, and the secure store has its seed. */
  | { status: 'ready'; deviceId: string }
  /** The local data has a device ID whose seed the secure store does not have. */
  | { status: 'lost'; deviceId: string };

const SEED_LENGTH = 32;
const SEED = /^[0-9a-f]{64}$/;
/** What tells the signing key from the other keys a seed gives (SHARING-21.1). */
const SIGNING_PURPOSE = 'shared-expense/device/signing/v1';

// Readable once the phone has been unlocked after a restart, so that background sync can
// sign, and never restored to another phone (ADR-0015). No user authentication. A group
// key is kept the same way (SYNC-94.1).
export const SEED_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const seedEntry = (deviceId: string) => `device-seed.${deviceId}`;

interface StoredDevice {
  deviceId: string;
  registered: number;
  clockOffsetMs: number;
}

async function readStoredDevice(
  executor: SqlExecutor,
): Promise<StoredDevice | undefined> {
  const [device] = await executor.all<StoredDevice>(
    'SELECT deviceId, registered, clockOffsetMs FROM device_identity WHERE singleton = 1',
  );
  return device;
}

/**
 * The seed of `deviceId`; undefined when the secure store has no entry for it, or one
 * that holds no seed. Rejects when the secure store cannot be read, which is not the same
 * (SHARING-30.1).
 */
async function readSeed(deviceId: string): Promise<Uint8Array | undefined> {
  const value = await SecureStore.getItemAsync(
    seedEntry(deviceId),
    SEED_OPTIONS,
  );
  return value !== null && SEED.test(value) ? hexToBytes(value) : undefined;
}

/** Reads this phone's device identity without making one. Rejects when the secure store cannot be read. */
export async function readDeviceIdentity(
  database: SqlExecutor,
  onSeedReadError?: (cause: unknown) => never,
): Promise<DeviceIdentity> {
  const device = await readStoredDevice(database);
  if (!device) return { status: 'none' };
  const seed = await readSeed(device.deviceId).catch(onSeedReadError);
  return { status: seed ? 'ready' : 'lost', deviceId: device.deviceId };
}

/** The API's time minus this phone's clock, in milliseconds: 0 until the API has told. */
export async function readClockOffsetMs(
  database: SqlExecutor,
): Promise<number> {
  return (await readStoredDevice(database))?.clockOffsetMs ?? 0;
}

/** This phone's corrected time: its clock plus the offset, kept within what a time can be. */
export async function readCorrectedTime(
  database: SqlExecutor,
): Promise<number> {
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(0, Date.now() + (await readClockOffsetMs(database))),
  );
}

export async function saveClockOffsetMs(
  database: SqlExecutor,
  clockOffsetMs: number,
): Promise<void> {
  await database.run(
    'UPDATE device_identity SET clockOffsetMs = ? WHERE singleton = 1',
    [clockOffsetMs],
  );
}

/** Records that the API has answered that `deviceId` is registered (SHARING-22.1). */
export async function saveRegistered(
  database: SqlExecutor,
  deviceId: string,
): Promise<void> {
  await database.run(
    'UPDATE device_identity SET registered = 1 WHERE singleton = 1 AND deviceId = ?',
    [deviceId],
  );
}

/** A device identity that can sign. */
export interface SigningDevice {
  deviceId: string;
  /** The Ed25519 public key the API verifies this device with, in hexadecimal. */
  publicKey: string;
  /** The X25519 public key shared with members when this device asks to join. */
  readonly boxKey: string;
  /** Whether the API has answered that this device is registered. */
  registered: boolean;
  /** The Ed25519 signature of `message`. */
  sign(message: Uint8Array): Uint8Array;
}

function signingDevice(
  deviceId: string,
  seed: Uint8Array,
  registered: boolean,
): SigningDevice {
  const secretKey = deriveKey({ secret: seed, purpose: SIGNING_PURPOSE });
  return {
    deviceId,
    publicKey: bytesToHex(signingPublicKey(secretKey)),
    get boxKey() {
      return bytesToHex(
        boxPublicKey(
          deriveKey({ secret: seed, purpose: 'shared-expense/device/box/v1' }),
        ),
      );
    },
    registered,
    sign: (message) => sign({ secretKey, message }),
  };
}

/**
 * Makes this phone's device identity (SHARING-20.1). The seed is stored before the device
 * ID is saved: a run that stops in between leaves an entry that no device ID names, which
 * nothing reads, and never a device ID without its seed (ADR-0022). When the device ID
 * cannot be saved the phone still has no identity (SHARING-24.1).
 */
async function createDevice(database: SqlExecutor): Promise<SigningDevice> {
  const deviceId = randomUUID();
  const seed = getRandomValues(new Uint8Array(SEED_LENGTH));
  await SecureStore.setItemAsync(
    seedEntry(deviceId),
    bytesToHex(seed),
    SEED_OPTIONS,
  );
  try {
    await database.run(
      'INSERT INTO device_identity (singleton, deviceId) VALUES (1, ?)',
      [deviceId],
    );
  } catch (error) {
    // Nothing names this entry now. Removing it is tidiness only, so a failure to is
    // not what the caller hears about.
    await SecureStore.deleteItemAsync(seedEntry(deviceId), SEED_OPTIONS).catch(
      () => undefined,
    );
    throw error;
  }
  return signingDevice(deviceId, seed, false);
}

/**
 * This phone's device identity, ready to sign, made first when the phone has none.
 * Resolves with `lost` when the local data has a device ID whose seed the secure store
 * does not have (SHARING-29.1), and rejects when the identity cannot be read or saved.
 */
export async function ensureDevice(
  database: SqlExecutor,
  onSeedReadError?: (cause: unknown) => never,
): Promise<SigningDevice | 'lost'> {
  const device = await readStoredDevice(database);
  if (!device) return createDevice(database);
  const seed = await readSeed(device.deviceId).catch(onSeedReadError);
  return seed
    ? signingDevice(device.deviceId, seed, device.registered === 1)
    : 'lost';
}
