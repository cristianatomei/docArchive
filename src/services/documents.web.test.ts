import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupAttachment } from '../core/types';
import {
  captureDocumentPhoto, extractAttachmentText, ocrSupported, openAttachment,
  pickBackupFile, pickDocumentAttachments, readAttachmentBackup, removeStoredAttachment,
  restoreAttachment, saveBackupFile,
} from './documents.web';
import { MAX_ATTACHMENT_BYTES, MAX_BACKUP_BYTES } from './attachmentValidation';

const mocks = vi.hoisted(() => ({ pick: vi.fn(), camera: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: mocks.pick }));
vi.mock('expo-image-picker', () => ({ launchCameraAsync: mocks.camera }));

const original: BackupAttachment = { id: 'old-id', name: '../original name.png', mimeType: 'image/png', base64: 'AAECA/8=' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('durable browser attachments', () => {
  it('round-trips exact bytes through IndexedDB and stages each restore under a new ID', async () => {
    const first = await restoreAttachment(original);
    const second = await restoreAttachment(original);
    expect(first.name).toBe(original.name);
    expect(first.uri).toBe(`idb://${first.id}`);
    expect(second.id).not.toBe(first.id);
    expect(await readAttachmentBackup(first)).toEqual({ ...original, id: first.id });
    await removeStoredAttachment(first);
    await expect(readAttachmentBackup(first)).rejects.toThrow('missing');
    expect((await readAttachmentBackup(second)).base64).toBe(original.base64);
    await removeStoredAttachment(second);
  });

  it('persists picked originals instead of transient picker URLs', async () => {
    const file = new File(['original bytes'], 'original.pdf', { type: 'application/pdf' });
    mocks.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'blob:transient-picker-url', name: file.name, mimeType: file.type, file }] });
    const [attachment] = await pickDocumentAttachments();
    expect(attachment.uri).toMatch(/^idb:\/\//);
    expect(atob((await readAttachmentBackup(attachment)).base64)).toBe('original bytes');
    await removeStoredAttachment(attachment);
  });

  it('rejects unsupported MIME types and oversize or malformed backup contents', async () => {
    await expect(restoreAttachment({ ...original, mimeType: 'application/javascript' })).rejects.toThrow('Unsupported');
    await expect(restoreAttachment({ ...original, base64: 'not valid!' })).rejects.toThrow('invalid');
    await expect(restoreAttachment({ ...original, base64: 'A'.repeat(4 * Math.ceil(MAX_ATTACHMENT_BYTES / 3) + 4) })).rejects.toThrow('oversized');
  });

  it('rejects oversized picked blobs', async () => {
    const file = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'big.png', { type: 'image/png' });
    mocks.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'blob:big', file, name: file.name, mimeType: file.type }] });
    await expect(pickDocumentAttachments()).rejects.toThrow('10 MB');
  });

  it('handles picker and camera cancellation without errors', async () => {
    mocks.pick.mockResolvedValue({ canceled: true, assets: null });
    mocks.camera.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickDocumentAttachments()).toEqual([]);
    expect(await pickBackupFile()).toBeNull();
    expect(await captureDocumentPhoto()).toBeNull();
  });

  it('stores browser camera captures durably', async () => {
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    mocks.camera.mockResolvedValue({ canceled: false, assets: [{ uri: 'blob:photo', file, fileName: file.name, mimeType: file.type }] });
    const attachment = await captureDocumentPhoto();
    expect(attachment?.uri).toMatch(/^idb:\/\//);
    expect(atob((await readAttachmentBackup(attachment!)).base64)).toBe('photo');
    await removeStoredAttachment(attachment!);
  });

  it('fails explicitly when browser persistence is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    try {
      await expect(restoreAttachment(original)).rejects.toThrow('IndexedDB');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects paths outside owned storage', async () => {
    const attachment = await restoreAttachment(original);
    await expect(removeStoredAttachment({ ...attachment, uri: 'https://remote.example/document' })).rejects.toThrow('does not belong');
    await removeStoredAttachment(attachment);
  });

  it('refuses attachment bytes whose size no longer matches the saved metadata', async () => {
    const attachment = await restoreAttachment(original);
    await expect(readAttachmentBackup({ ...attachment, size: attachment.size + 1 })).rejects.toThrow('no longer matches its saved size');
    await removeStoredAttachment(attachment);
  });

  it('closes a late successful database connection after a blocked open rejected', async () => {
    const close = vi.fn();
    const request: {
      result: { close: typeof close };
      onblocked?: () => void;
      onsuccess?: () => void;
    } = { result: { close } };
    vi.stubGlobal('indexedDB', { open: () => {
      queueMicrotask(() => request.onblocked?.());
      return request;
    } });
    try {
      await expect(restoreAttachment(original)).rejects.toThrow('blocked');
      request.onsuccess?.();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('disables OCR without loading a native module and explains PDF limitation', async () => {
    const attachment = await restoreAttachment(original);
    expect(ocrSupported()).toBe(false);
    await expect(extractAttachmentText(attachment)).rejects.toThrow('unavailable in browsers');
    await expect(extractAttachmentText({ ...attachment, mimeType: 'application/pdf' })).rejects.toThrow('images only');
    await removeStoredAttachment(attachment);
  });
});

describe('browser backups and viewing', () => {
  it('reads JSON backup files and rejects oversized input before reading', async () => {
    const file = new File(['{"format":"docarchive-backup"}'], 'backup.json', { type: 'application/json' });
    mocks.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'blob:backup', file }] });
    expect(await pickBackupFile()).toBe(await file.text());
    const oversized = new File([new Uint8Array(MAX_BACKUP_BYTES + 1)], 'big.json');
    mocks.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'blob:big', file: oversized }] });
    await expect(pickBackupFile()).rejects.toThrow('30 MB');
  });

  it('downloads attachment bytes and portable JSON with the original download name', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const anchor = { href: '', download: '', rel: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: () => anchor, body: { appendChild: vi.fn() } });
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    try {
      const attachment = await restoreAttachment(original);
      await openAttachment(attachment);
      expect(anchor.download).toBe(original.name);
      expect(anchor.click).toHaveBeenCalledOnce();
      await saveBackupFile('{"format":"docarchive-backup"}');
      expect(anchor.download).toMatch(/^docarchive-backup-.*\.json$/);
      expect(createUrl).toHaveBeenCalledTimes(2);
      expect(revokeUrl).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revokeUrl).toHaveBeenCalledTimes(2);
      await removeStoredAttachment(attachment);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
});
