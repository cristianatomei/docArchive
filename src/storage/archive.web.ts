import { MAX_ARCHIVE_JSON_BYTES, validateArchive } from '../core/archive';
import type { ArchiveData } from '../core/types';

const DATABASE_NAME = 'docarchive';
const DATABASE_VERSION = 1;
const STORE = 'snapshots';
const KEY = 'archive';
let observedSnapshot: string | null | undefined;

function storageError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
  return new Error(`Archive storage failed (IndexedDB): ${message}`);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(storageError('IndexedDB is unavailable. Enable browser storage to use the archive.'));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch (error) {
      reject(storageError(error));
      return;
    }
    let blocked = false;
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => {
      blocked = true;
      reject(storageError('Database upgrade is blocked. Close other docArchive tabs and retry.'));
    };
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      if (!database.objectStoreNames.contains(STORE)) {
        database.close();
        reject(storageError('Database schema is corrupt (missing snapshots store).'));
        return;
      }
      resolve(database);
    };
  });
}

export async function readArchive(): Promise<ArchiveData | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let result: ArchiveData | null = null;
    let snapshot: string | null = null;
    let validationError: unknown;
    try {
      const transaction = database.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(KEY);
      request.onsuccess = () => {
        try {
          if (request.result === undefined) return;
          if (typeof request.result !== 'string' || request.result.length > MAX_ARCHIVE_JSON_BYTES) {
            throw new Error('Stored archive snapshot is corrupt or exceeds its size limit.');
          }
          result = validateArchive(JSON.parse(request.result));
          snapshot = request.result;
        } catch (error) {
          validationError = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => {
        observedSnapshot = snapshot;
        database.close();
        resolve(result);
      };
      transaction.onabort = transaction.onerror = () => {
        database.close();
        reject(storageError(validationError ?? transaction.error));
      };
    } catch (error) {
      database.close();
      reject(storageError(error));
    }
  });
}

/** Compare and replace within one transaction to avoid overwriting another tab's changes. */
export async function writeArchive(archive: ArchiveData): Promise<void> {
  const snapshot = JSON.stringify(validateArchive(archive));
  const expectedSnapshot = observedSnapshot;
  if (expectedSnapshot === undefined) {
    throw storageError('Read the archive successfully before saving. Reload the archive and retry.');
  }
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE, 'readwrite');
      let conflict: Error | undefined;
      const store = transaction.objectStore(STORE);
      const request = store.get(KEY);
      request.onsuccess = () => {
        const currentSnapshot = request.result === undefined ? null : request.result;
        if (currentSnapshot !== expectedSnapshot) {
          conflict = new Error('Archive changed in another tab. Reload the archive before saving again.');
          transaction.abort();
          return;
        }
        store.put(snapshot, KEY);
      };
      transaction.oncomplete = () => {
        observedSnapshot = snapshot;
        database.close();
        resolve();
      };
      transaction.onabort = transaction.onerror = () => {
        database.close();
        reject(storageError(conflict ?? transaction.error));
      };
    } catch (error) {
      database.close();
      reject(storageError(error));
    }
  });
}
