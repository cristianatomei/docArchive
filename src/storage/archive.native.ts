import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { MAX_ARCHIVE_JSON_BYTES, validateArchive } from '../core/archive';
import type { ArchiveData } from '../core/types';

const SCHEMA_VERSION = 1;
let opening: Promise<SQLiteDatabase> | undefined;
let observedSnapshot: string | null | undefined;

function storageError(error: unknown): Error {
  return new Error(`Archive storage failed (SQLite): ${error instanceof Error ? error.message : String(error)}`);
}

async function openDatabase(): Promise<SQLiteDatabase> {
  if (!opening) {
    opening = (async () => {
      const database = await openDatabaseAsync('docarchive.db');
      try {
        await database.withExclusiveTransactionAsync(async (transaction) => {
          const schema = await transaction.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
          const version = schema?.user_version;
          if (version !== 0 && version !== SCHEMA_VERSION) {
            throw new Error(`Unsupported database schema version ${String(version)}.`);
          }
          if (version === 0) {
            await transaction.execAsync(`
              CREATE TABLE IF NOT EXISTS archive_snapshot (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL
              );
              PRAGMA user_version = 1;
            `);
          }
        });
        return database;
      } catch (error) {
        await database.closeAsync();
        throw error;
      }
    })().catch((error: unknown) => {
      opening = undefined;
      throw storageError(error);
    });
  }
  return opening;
}

export async function readArchive(): Promise<ArchiveData | null> {
  try {
    const database = await openDatabase();
    const row = await database.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM archive_snapshot WHERE id = 1',
    );
    if (!row) {
      observedSnapshot = null;
      return null;
    }
    if (typeof row.payload !== 'string' || row.payload.length > MAX_ARCHIVE_JSON_BYTES) {
      throw new Error('Stored archive snapshot is corrupt or exceeds its size limit.');
    }
    const archive = validateArchive(JSON.parse(row.payload));
    observedSnapshot = row.payload;
    return archive;
  } catch (error) {
    throw storageError(error);
  }
}

/** Prototype storage is unencrypted and is not approved for real sensitive school records. */
export async function writeArchive(archive: ArchiveData): Promise<void> {
  const snapshot = JSON.stringify(validateArchive(archive));
  const expectedSnapshot = observedSnapshot;
  if (expectedSnapshot === undefined) {
    throw storageError('Read the archive successfully before saving. Reload the archive and retry.');
  }
  try {
    const database = await openDatabase();
    await database.withExclusiveTransactionAsync(async (transaction) => {
      const row = await transaction.getFirstAsync<{ payload: string }>(
        'SELECT payload FROM archive_snapshot WHERE id = 1',
      );
      if ((row ? row.payload : null) !== expectedSnapshot) {
        throw new Error('Archive changed in another session. Reload the archive before saving again.');
      }
      await transaction.runAsync(
        'INSERT INTO archive_snapshot (id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload',
        snapshot,
      );
    });
    observedSnapshot = snapshot;
  } catch (error) {
    throw storageError(error);
  }
}
