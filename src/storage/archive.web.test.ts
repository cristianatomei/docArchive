import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyArchive } from '../core/archive';

vi.mock('expo-crypto', () => ({ randomUUID: () => 'test-id' }));

let readArchive: typeof import('./archive.web').readArchive;
let writeArchive: typeof import('./archive.web').writeArchive;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  ({ readArchive, writeArchive } = await import('./archive.web'));
});

async function putRaw(value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('docarchive', 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('snapshots', 'readwrite');
      transaction.objectStore('snapshots').put(value, 'archive');
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  });
}

describe('IndexedDB archive persistence', () => {
  it('returns null only for absent snapshots and persists across separate connections', async () => {
    expect(await readArchive()).toBeNull();
    const archive = createEmptyArchive();
    await readArchive();
    await writeArchive(archive);
    expect(await readArchive()).toEqual(archive);
    archive.settings.language = 'en';
    await writeArchive(archive);
    expect((await readArchive())?.settings.language).toBe('en');
  });

  it('rejects invalid writes without losing the previous snapshot', async () => {
    const archive = createEmptyArchive();
    await readArchive();
    await writeArchive(archive);
    await expect(writeArchive({ ...archive, version: 2 } as never)).rejects.toThrow('unsupported');
    expect(await readArchive()).toEqual(archive);
  });

  it.each(['broken JSON', 'null', '{"version":2}', { version: 1 }])(
    'reports corrupt snapshots rather than resetting: %j',
    async (value) => {
      await putRaw(value);
      await expect(readArchive()).rejects.toThrow('Archive storage failed');
      await expect(readArchive()).rejects.toThrow('Archive storage failed');
    },
  );

  it('reports unavailable and denied storage explicitly', async () => {
    await readArchive();
    vi.stubGlobal('indexedDB', undefined);
    await expect(readArchive()).rejects.toThrow('unavailable');
    vi.stubGlobal('indexedDB', {
      open: () => { throw new DOMException('Storage denied', 'SecurityError'); },
    });
    await expect(writeArchive(createEmptyArchive())).rejects.toThrow('Storage denied');
  });

  it('requires a successful read and does not initialize observation on corrupt reads', async () => {
    await expect(writeArchive(createEmptyArchive())).rejects.toThrow('Read the archive successfully');
    await putRaw('broken JSON');
    await expect(readArchive()).rejects.toThrow('Archive storage failed');
    await expect(writeArchive(createEmptyArchive())).rejects.toThrow('Read the archive successfully');
  });

  it('rejects external updates without overwriting them, and allows saving after reload', async () => {
    await readArchive();
    const external = createEmptyArchive();
    external.settings.language = 'en';
    await putRaw(JSON.stringify(external));
    await expect(writeArchive(createEmptyArchive())).rejects.toThrow('another tab. Reload');
    expect(await readArchive()).toEqual(external);
    await writeArchive(createEmptyArchive());
    expect(await readArchive()).toEqual(createEmptyArchive());
  });

  it('rejects changes after a stored snapshot was read', async () => {
    await readArchive();
    await writeArchive(createEmptyArchive());
    const external = createEmptyArchive();
    external.tags = [{ id: 'external', name: 'External', color: '#2563EB' }];
    await putRaw(JSON.stringify(external));
    await expect(writeArchive(createEmptyArchive())).rejects.toThrow('Reload');
    expect(await readArchive()).toEqual(external);
  });

  it('updates observation after commits so serialized writes do not need an intervening read', async () => {
    await readArchive();
    const archive = createEmptyArchive();
    await writeArchive(archive);
    archive.settings.language = 'en';
    await writeArchive(archive);
    archive.tags = [{ id: 'new-tag', name: 'New', color: '#2563EB' }];
    await writeArchive(archive);
    expect(await readArchive()).toEqual(archive);
  });

  it('rejects a future database version without deleting it', async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.open('docarchive', 2);
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
    await expect(readArchive()).rejects.toThrow('IndexedDB');
  });

  it('rejects an existing malformed schema', async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.open('docarchive', 1);
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
    await expect(readArchive()).rejects.toThrow('schema is corrupt');
  });
});
