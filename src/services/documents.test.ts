import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from '../core/types';
import {
  captureDocumentPhoto, extractAttachmentText, ocrSupported, openAttachment,
  pickBackupFile, pickDocumentAttachments, readAttachmentBackup, removeStoredAttachment,
  restoreAttachment, saveBackupFile,
} from './documents';

const mocks = vi.hoisted(() => ({
  pick: vi.fn(), camera: vi.fn(), permission: vi.fn(), optionalModule: vi.fn(),
  shareAvailable: vi.fn(), share: vi.fn(), preview: vi.fn(), canPreview: vi.fn(),
  platform: { OS: 'android' },
  files: new Map<string, Uint8Array>(),
  encoder: new TextEncoder(),
}));

vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: mocks.pick }));
vi.mock('expo-image-picker', () => ({ launchCameraAsync: mocks.camera, requestCameraPermissionsAsync: mocks.permission }));
vi.mock('expo-modules-core', () => ({ requireOptionalNativeModule: mocks.optionalModule }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: mocks.shareAvailable, shareAsync: mocks.share }));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(parent: string, name: string) { this.uri = `${parent}/${name}`; }
    create() {}
  }
  class File {
    uri: string;
    constructor(parent: string | Directory, name?: string) {
      this.uri = `${typeof parent === 'string' ? parent : parent.uri}${name ? `/${name}` : ''}`;
    }
    get exists() { return mocks.files.has(this.uri); }
    get size() { return mocks.files.get(this.uri)?.byteLength ?? 0; }
    create() {
      if (this.exists) throw new Error('Already exists');
      mocks.files.set(this.uri, new Uint8Array());
    }
    copy(destination: File) {
      if (!this.exists) throw new Error('File missing');
      mocks.files.set(destination.uri, mocks.files.get(this.uri)!.slice());
    }
    write(content: string, options?: { encoding?: string }) {
      mocks.files.set(this.uri, options?.encoding === 'base64'
        ? Uint8Array.from(atob(content), char => char.charCodeAt(0)) : mocks.encoder.encode(content));
    }
    delete() { mocks.files.delete(this.uri); }
    async base64() { return btoa(String.fromCharCode(...mocks.files.get(this.uri)!)); }
    async text() { return new TextDecoder().decode(mocks.files.get(this.uri)!); }
    canPreview = mocks.canPreview;
    preview = mocks.preview;
  }
  return { Directory, File, Paths: { document: 'file:///documents', cache: 'file:///cache' } };
});

const backup = { id: 'previous-id', name: '../Original document.png', mimeType: 'image/png', base64: 'AAECA/8=' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.files.clear();
  mocks.platform.OS = 'android';
  mocks.optionalModule.mockReturnValue(null);
  mocks.permission.mockResolvedValue({ granted: true });
  mocks.shareAvailable.mockResolvedValue(true);
  mocks.share.mockResolvedValue(undefined);
  mocks.canPreview.mockResolvedValue(false);
  mocks.preview.mockResolvedValue(undefined);
});

describe('native durable imports', () => {
  it('copies original bytes to private documents storage under UUID rather than user paths', async () => {
    mocks.files.set('file:///picker.png', new Uint8Array([0, 1, 2, 3, 255]));
    mocks.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///picker.png', name: backup.name, mimeType: 'image/png' }] });
    const [attachment] = await pickDocumentAttachments();
    expect(attachment.uri).toMatch(/^file:\/\/\/documents\/attachments\/[0-9a-f-]+\.png$/);
    expect(attachment.name).toBe(backup.name);
    mocks.files.delete('file:///picker.png');
    expect((await readAttachmentBackup(attachment)).base64).toBe(backup.base64);
  });

  it('stages restored files with unique IDs without overwriting existing bytes', async () => {
    const first = await restoreAttachment(backup);
    const second = await restoreAttachment({ ...backup, base64: 'dGVzdA==' });
    expect(first.id).not.toBe(second.id);
    expect((await readAttachmentBackup(first)).base64).toBe(backup.base64);
    expect((await readAttachmentBackup(second)).base64).toBe('dGVzdA==');
    await removeStoredAttachment(first);
    await removeStoredAttachment(first);
    await expect(readAttachmentBackup(first)).rejects.toThrow('missing');
    await expect(removeStoredAttachment({ ...second, uri: 'file:///outside' })).rejects.toThrow('does not belong');
  });

  it('refuses attachment bytes whose size no longer matches the saved metadata', async () => {
    const attachment = await restoreAttachment(backup);
    mocks.files.set(attachment.uri, new Uint8Array([9, 8]));
    await expect(readAttachmentBackup(attachment)).rejects.toThrow('no longer matches its saved size');
  });

  it('rolls back earlier files if an import batch contains an unsupported file', async () => {
    mocks.files.set('file:///picker.png', new Uint8Array([1]));
    mocks.pick.mockResolvedValue({ canceled: false, assets: [
      { uri: 'file:///picker.png', name: 'good.png', mimeType: 'image/png' },
      { uri: 'file:///bad.js', name: 'bad.js', mimeType: 'application/javascript' },
    ] });
    await expect(pickDocumentAttachments()).rejects.toThrow('Unsupported');
    expect([...mocks.files.keys()]).toEqual(['file:///picker.png']);
  });

  it('returns cancellation and surfaces permission denials', async () => {
    mocks.pick.mockResolvedValue({ canceled: true, assets: null });
    mocks.camera.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickDocumentAttachments()).toEqual([]);
    expect(await pickBackupFile()).toBeNull();
    expect(await captureDocumentPhoto()).toBeNull();
    mocks.permission.mockResolvedValue({ granted: false });
    await expect(captureDocumentPhoto()).rejects.toThrow('Camera permission');
  });

  it('persists camera captures rather than leaving cache references', async () => {
    mocks.files.set('file:///camera.jpg', new Uint8Array([7, 8]));
    mocks.camera.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///camera.jpg', fileName: 'camera.jpg', mimeType: 'image/jpeg' }] });
    const attachment = await captureDocumentPhoto();
    expect(attachment?.uri).toMatch(/^file:\/\/\/documents\/attachments\//);
    expect(attachment?.size).toBe(2);
  });
});

describe('native offline OCR', () => {
  it('does not require an unbundled module at startup and explains Expo Go limitation', async () => {
    expect(ocrSupported()).toBe(false);
    const attachment = await restoreAttachment(backup);
    await expect(extractAttachmentText(attachment)).rejects.toThrow('Expo Go');
  });

  it('passes file URLs to the owned bridge on Android and iOS', async () => {
    const extractTextFromImage = vi.fn().mockResolvedValue(['First line', 'Second line']);
    mocks.optionalModule.mockReturnValue({ isSupported: true, extractTextFromImage });
    expect(ocrSupported()).toBe(true);
    expect(mocks.optionalModule).toHaveBeenLastCalledWith('DocArchiveOcr');
    const attachment = await restoreAttachment(backup);
    expect(await extractAttachmentText(attachment)).toBe('First line\nSecond line');
    expect(extractTextFromImage).toHaveBeenLastCalledWith(attachment.uri);
    mocks.platform.OS = 'ios';
    await extractAttachmentText(attachment);
    expect(extractTextFromImage).toHaveBeenLastCalledWith(attachment.uri);
  });

  it('rejects PDF OCR and surfaces recognition failures without discarding manual text', async () => {
    await expect(extractAttachmentText({ mimeType: 'application/pdf', name: 'file.pdf' } as Attachment)).rejects.toThrow('images only');
    const attachment = await restoreAttachment(backup);
    mocks.optionalModule.mockReturnValue({ isSupported: true, extractTextFromImage: vi.fn().mockRejectedValue(new Error('Decode failure')) });
    await expect(extractAttachmentText(attachment)).rejects.toThrow('enter text manually');
  });
});

describe('native viewing and backup files', () => {
  it('previews files when possible and falls back to safe OS sharing', async () => {
    const attachment = await restoreAttachment(backup);
    mocks.canPreview.mockResolvedValue(true);
    await openAttachment(attachment);
    expect(mocks.preview).toHaveBeenCalledOnce();
    expect(mocks.share).not.toHaveBeenCalled();
    mocks.canPreview.mockResolvedValue(false);
    await openAttachment(attachment);
    expect(mocks.share).toHaveBeenCalledWith(attachment.uri, expect.objectContaining({ mimeType: 'image/png' }));
  });

  it('shares portable JSON and deletes the cache only after sharing completes', async () => {
    mocks.share.mockImplementation(async (uri: string) => {
      expect(mocks.files.has(uri)).toBe(true);
      expect(new TextDecoder().decode(mocks.files.get(uri)!)).toBe('{"format":"docarchive-backup"}');
    });

    await saveBackupFile('{"format":"docarchive-backup"}');
    expect(mocks.files.size).toBe(0);
    mocks.shareAvailable.mockResolvedValue(false);
    await expect(saveBackupFile('{}')).rejects.toThrow('sharing is unavailable');
  });

  it('exports without relying on a global TextEncoder', async () => {
    vi.stubGlobal('TextEncoder', undefined);
    try {
      await saveBackupFile('{"text":"școală 🗃️"}');
      expect(mocks.share).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reads local JSON and refuses oversize backups', async () => {
    mocks.files.set('file:///backup.json', new TextEncoder().encode('{"version":1}'));
    mocks.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///backup.json' }] });
    expect(await pickBackupFile()).toBe('{"version":1}');
    mocks.files.set('file:///backup.json', new Uint8Array(30 * 1024 * 1024 + 1));
    await expect(pickBackupFile()).rejects.toThrow('30 MB');
  });
});
