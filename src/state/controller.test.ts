import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyArchive, upsertDocument } from '../core/archive';
import type { ArchiveData, ArchiveBackup, Attachment, DocumentInput } from '../core/types';
import { ArchiveController, type ArchiveFiles, type ArchiveStorage } from './controller';

vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

const attachment: Attachment = {
  id: 'old-file', name: 'scan.jpg', mimeType: 'image/jpeg', size: 2, uri: 'idb://old-file',
};
const input: DocumentInput = {
  title: 'Catalog de probă', categoryId: null, tagIds: [], schoolYear: '2025-2026',
  className: 'VIII A', studentName: 'Elev fictiv', reference: '', physicalLocation: '',
  notes: '', ocrText: '', status: 'draft', attachments: [],
};
let stored: ArchiveData | null;
let storage: ArchiveStorage;
let files: ArchiveFiles;
let controller: ArchiveController;

function portableBackup(): ArchiveBackup {
  return {
    format: 'docarchive-backup', version: 1, exportedAt: new Date().toISOString(),
    archive: upsertDocument(createEmptyArchive(), { ...input, attachments: [attachment] }).archive,
    files: [{ id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, base64: 'aGk=' }],
  };
}

beforeEach(() => {
  stored = null;
  storage = {
    readArchive: vi.fn(async () => stored),
    writeArchive: vi.fn(async archive => { stored = structuredClone(archive); }),
  };
  files = {
    readAttachmentBackup: vi.fn(async file => ({
      id: file.id, name: file.name, mimeType: file.mimeType, base64: 'aGk=',
    })),
    restoreAttachment: vi.fn(async file => ({ ...attachment, id: 'staged-file', uri: 'idb://staged-file' })),
    removeStoredAttachment: vi.fn(async () => {}),
    saveBackupFile: vi.fn(async () => {}),
    pickBackupFile: vi.fn(async () => null),
  };
  controller = new ArchiveController(storage, files);
});

describe('archive controller integration', () => {
  it('initializes storage once and restores settings and records on a new instance', async () => {
    await controller.reload();
    expect(stored?.documents).toEqual([]);
    await controller.saveDocument(input);
    await controller.setLanguage('en');
    const reopened = new ArchiveController(storage, files);
    await reopened.reload();
    expect(reopened.getSnapshot().archive.settings.language).toBe('en');
    expect(reopened.getSnapshot().archive.documents[0].title).toBe(input.title);
    expect(storage.writeArchive).toHaveBeenCalledTimes(3);
  });

  it('does not overwrite unreadable storage and blocks all mutations until reload succeeds', async () => {
    vi.mocked(storage.readArchive).mockRejectedValueOnce(new Error('Corrupt archive'));
    await expect(controller.reload()).rejects.toThrow('Corrupt');
    expect(controller.getSnapshot()).toMatchObject({ loading: false, error: 'Corrupt archive' });
    await expect(controller.saveDocument(input)).rejects.toThrow('unavailable');
    expect(storage.writeArchive).not.toHaveBeenCalled();
    await controller.reload();
    await controller.saveDocument(input);
    expect(stored?.documents).toHaveLength(1);
  });

  it('serializes competing writes without dropping records', async () => {
    await controller.reload();
    await Promise.all([
      controller.saveDocument({ ...input, title: 'A' }),
      controller.saveDocument({ ...input, title: 'B' }),
      controller.setLanguage('en'),
    ]);
    expect(stored?.documents.map(document => document.title)).toEqual(['A', 'B']);
    expect(stored?.settings.language).toBe('en');
    expect(controller.getSnapshot().busy).toBe(false);
  });

  it('keeps state unchanged on a failed metadata write and allows retry', async () => {
    await controller.reload();
    vi.mocked(storage.writeArchive).mockRejectedValueOnce(new Error('Disk full'));
    await expect(controller.saveDocument(input)).rejects.toThrow('Disk full');
    expect(controller.getSnapshot().archive.documents).toEqual([]);
    expect(files.removeStoredAttachment).not.toHaveBeenCalled();
    await controller.saveDocument(input);
    expect(controller.getSnapshot().archive.documents).toHaveLength(1);
  });

  it('deletes files only after committed metadata and reports cleanup failures without duplicating saved records', async () => {
    await controller.reload();
    const original = await controller.saveDocument({ ...input, attachments: [attachment] });
    vi.mocked(files.removeStoredAttachment).mockImplementationOnce(async () => {
      expect(stored?.documents[0].attachments).toEqual([]);
      throw new Error('File locked');
    });
    const saved = await controller.saveDocument(input, original.id);
    expect(saved.id).toBe(original.id);
    expect(controller.getSnapshot().archive.documents).toHaveLength(1);
    expect(controller.getSnapshot().error).toContain('Document saved');
    expect(controller.getSnapshot().error).toContain('File locked');
    await controller.deleteDocument(original.id);
    expect(stored?.documents).toEqual([]);
  });

  it('exports complete portable files and rejects an incomplete backup', async () => {
    await controller.reload();
    await controller.saveDocument({ ...input, attachments: [attachment] });
    await controller.exportBackup();
    const payload = JSON.parse(vi.mocked(files.saveBackupFile).mock.calls[0][0]);
    expect(payload.files[0].base64).toBe('aGk=');
    vi.mocked(files.readAttachmentBackup).mockRejectedValueOnce(new Error('Missing file'));
    await expect(controller.exportBackup()).rejects.toThrow('Missing file');
    expect(files.saveBackupFile).toHaveBeenCalledTimes(1);
  });

  it('cancels restoration without changing data and rejects malformed or incomplete backups', async () => {
    await controller.reload();
    await expect(controller.importBackup()).resolves.toBe(false);
    vi.mocked(files.pickBackupFile).mockResolvedValueOnce('not json');
    await expect(controller.importBackup()).rejects.toThrow('valid JSON');
    vi.mocked(files.pickBackupFile).mockResolvedValueOnce(JSON.stringify({ ...portableBackup(), files: [] }));
    await expect(controller.importBackup()).rejects.toThrow('missing attachment');
    expect(files.restoreAttachment).not.toHaveBeenCalled();
  });

  it('stages restored files with new IDs and removes previous files after the metadata swap', async () => {
    await controller.reload();
    await controller.saveDocument({ ...input, attachments: [attachment] });
    vi.mocked(files.pickBackupFile).mockResolvedValueOnce(JSON.stringify(portableBackup()));
    vi.mocked(files.removeStoredAttachment).mockImplementationOnce(async () => {
      expect(stored?.documents[0].attachments[0].id).toBe('staged-file');
    });
    await expect(controller.importBackup()).resolves.toBe(true);
    expect(stored?.documents[0].attachments[0].uri).toBe('idb://staged-file');
    expect(files.removeStoredAttachment).toHaveBeenCalledWith(attachment);
  });

  it('rolls back staged files if metadata commit fails while retaining the original archive', async () => {
    await controller.reload();
    const old = await controller.saveDocument(input);
    vi.mocked(files.pickBackupFile).mockResolvedValueOnce(JSON.stringify(portableBackup()));
    vi.mocked(storage.writeArchive).mockRejectedValueOnce(new Error('Quota exceeded'));
    await expect(controller.importBackup()).rejects.toThrow('Quota exceeded');
    expect(controller.getSnapshot().archive.documents[0].id).toBe(old.id);
    expect(files.removeStoredAttachment).toHaveBeenCalledWith(expect.objectContaining({ id: 'staged-file' }));
  });
});
