import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyArchive } from '../core/archive';

const sqlite = vi.hoisted(() => ({
  open: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
  exec: vi.fn(),
  transaction: vi.fn(),
  close: vi.fn(),
}));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: sqlite.open }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'test-id' }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  sqlite.get.mockResolvedValue({ user_version: 0 });
  sqlite.run.mockResolvedValue(undefined);
  sqlite.exec.mockResolvedValue(undefined);
  sqlite.close.mockResolvedValue(undefined);
  const database = {
    getFirstAsync: sqlite.get,
    runAsync: sqlite.run,
    execAsync: sqlite.exec,
    closeAsync: sqlite.close,
    withExclusiveTransactionAsync: sqlite.transaction,
  };
  sqlite.transaction.mockImplementation(async (callback) => callback(database));
  sqlite.open.mockResolvedValue(database);
});

describe('SQLite archive persistence', () => {
  it('initializes the schema in an exclusive transaction and returns null for no row', async () => {
    sqlite.get.mockResolvedValueOnce({ user_version: 0 }).mockResolvedValueOnce(null);
    const { readArchive } = await import('./archive.native');
    expect(await readArchive()).toBeNull();
    expect(sqlite.get).toHaveBeenNthCalledWith(1, 'PRAGMA user_version');
    expect(sqlite.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS archive_snapshot'));
    expect(sqlite.exec).toHaveBeenCalledWith(expect.stringContaining('PRAGMA user_version = 1'));
    expect(sqlite.transaction).toHaveBeenCalledTimes(1);
  });

  it('does not reinitialize an existing supported schema', async () => {
    sqlite.get.mockResolvedValueOnce({ user_version: 1 }).mockResolvedValueOnce(null);
    const { readArchive } = await import('./archive.native');
    expect(await readArchive()).toBeNull();
    expect(sqlite.get).toHaveBeenNthCalledWith(1, 'PRAGMA user_version');
    expect(sqlite.exec).not.toHaveBeenCalled();
    expect(sqlite.transaction).toHaveBeenCalledTimes(1);
  });

  it('stores the snapshot in a parameterized exclusive transaction', async () => {
    sqlite.get.mockResolvedValueOnce({ user_version: 0 }).mockResolvedValue(null);
    const { readArchive, writeArchive } = await import('./archive.native');
    const archive = createEmptyArchive();
    await readArchive();
    await writeArchive(archive);
    expect(sqlite.transaction).toHaveBeenCalledTimes(2);
    expect(sqlite.run).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), JSON.stringify(archive));
  });

  it('reads and strictly validates persisted JSON', async () => {
    const archive = createEmptyArchive();
    sqlite.get.mockResolvedValueOnce({ user_version: 1 })
      .mockResolvedValueOnce({ payload: JSON.stringify(archive) });
    const { readArchive } = await import('./archive.native');
    expect(await readArchive()).toEqual(archive);
    sqlite.get.mockResolvedValueOnce({ payload: 'not-json' });
    await expect(readArchive()).rejects.toThrow('SQLite');
    sqlite.get.mockResolvedValueOnce({ payload: '{"version":2}' });
    await expect(readArchive()).rejects.toThrow('Invalid archive');
  });

  it('rejects future schema versions without overwriting data and permits retry', async () => {
    sqlite.get.mockResolvedValueOnce({ user_version: 2 });
    const { readArchive } = await import('./archive.native');
    await expect(readArchive()).rejects.toThrow('Unsupported database schema version 2');
    expect(sqlite.run).not.toHaveBeenCalled();
    expect(sqlite.exec).not.toHaveBeenCalled();
    expect(sqlite.close).toHaveBeenCalledOnce();
    sqlite.get.mockResolvedValueOnce({ user_version: 1 }).mockResolvedValueOnce(null);
    expect(await readArchive()).toBeNull();
    expect(sqlite.open).toHaveBeenCalledTimes(2);
  });

  it('reports failed writes and does not accept corrupt input', async () => {
    sqlite.get.mockResolvedValueOnce({ user_version: 0 }).mockResolvedValue(null);
    const { readArchive, writeArchive } = await import('./archive.native');
    await readArchive();
    sqlite.run.mockRejectedValueOnce(new Error('disk full'));
    await expect(writeArchive(createEmptyArchive())).rejects.toThrow('disk full');
    await expect(writeArchive({ version: 2 } as never)).rejects.toThrow('Invalid archive');
    expect(sqlite.run).toHaveBeenCalledOnce();
  });

  it('requires a successful read and does not initialize observation on corrupt reads', async () => {
    const { readArchive, writeArchive } = await import('./archive.native');
    await expect(writeArchive(createEmptyArchive())).rejects.toThrow('Read the archive successfully');
    sqlite.get.mockResolvedValueOnce({ user_version: 1 }).mockResolvedValueOnce({ payload: 'broken JSON' });
    await expect(readArchive()).rejects.toThrow('SQLite');
    await expect(writeArchive(createEmptyArchive())).rejects.toThrow('Read the archive successfully');
    expect(sqlite.run).not.toHaveBeenCalled();
  });

  it('checks external changes inside the transaction and permits saving after reload', async () => {
    sqlite.get.mockResolvedValueOnce({ user_version: 1 }).mockResolvedValueOnce(null);
    const { readArchive, writeArchive } = await import('./archive.native');
    await readArchive();
    const external = createEmptyArchive();
    external.settings.language = 'en';
    sqlite.get.mockResolvedValue({ payload: JSON.stringify(external) });
    await expect(writeArchive(createEmptyArchive())).rejects.toThrow('another session. Reload');
    expect(sqlite.run).not.toHaveBeenCalled();
    expect(await readArchive()).toEqual(external);
    await writeArchive(createEmptyArchive());
    expect(sqlite.run).toHaveBeenCalledOnce();
    expect(sqlite.get).toHaveBeenLastCalledWith('SELECT payload FROM archive_snapshot WHERE id = 1');
  });

  it('updates observation only after a committed write', async () => {
    const original = createEmptyArchive();
    sqlite.get.mockResolvedValueOnce({ user_version: 1 })
      .mockResolvedValue({ payload: JSON.stringify(original) });
    const { readArchive, writeArchive } = await import('./archive.native');
    await readArchive();
    const changed = { ...original, settings: { language: 'en' as const } };
    sqlite.run.mockRejectedValueOnce(new Error('disk full'));
    await expect(writeArchive(changed)).rejects.toThrow('disk full');
    await writeArchive(changed);
    sqlite.get.mockResolvedValue({ payload: JSON.stringify(changed) });
    await writeArchive(original);
    expect(sqlite.run).toHaveBeenCalledTimes(3);
  });
});
