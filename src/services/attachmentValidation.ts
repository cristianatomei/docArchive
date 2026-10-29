import type { BackupAttachment } from '../core/types';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 30 * 1024 * 1024;
export const ATTACHMENT_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/bmp', 'image/tiff', 'image/heic', 'image/heif', 'image/avif',
];

const extensions: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif',
  avif: 'image/avif',
};

export function attachmentMimeType(name: string, mimeType?: string | null): string {
  const supplied = mimeType?.toLowerCase().split(';')[0].trim();
  const mime = supplied && supplied !== 'application/octet-stream'
    ? supplied : extensions[name.split('.').pop()?.toLowerCase() ?? ''];
  if (!mime || !ATTACHMENT_MIME_TYPES.includes(mime)) {
    throw new Error('Unsupported file type. Import a PDF or a supported image (JPEG, PNG, WebP, GIF, BMP, TIFF, HEIC, HEIF, AVIF).');
  }
  return mime;
}

export function assertAttachmentSize(size: number): void {
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('The attachment is empty or its size could not be read.');
  if (size > MAX_ATTACHMENT_BYTES) throw new Error('Each attachment must be 10 MB or smaller.');
}

export function storageExtension(mimeType: string): string {
  const match = Object.entries(extensions).find(([, mime]) => mime === mimeType);
  if (!match) throw new Error('Unsupported attachment type.');
  return match[0];
}

export function assertStorageId(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Invalid attachment storage identifier.');
  }
}

export function backupByteLength(backup: BackupAttachment): number {
  attachmentMimeType(backup.name, backup.mimeType);
  if (typeof backup.base64 !== 'string' || backup.base64.length > 4 * Math.ceil(MAX_ATTACHMENT_BYTES / 3)
    || backup.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(backup.base64)) {
    throw new Error('The backup contains invalid or oversized attachment data.');
  }
  const size = backup.base64.length / 4 * 3 - (backup.base64.endsWith('==') ? 2 : backup.base64.endsWith('=') ? 1 : 0);
  assertAttachmentSize(size);
  return size;
}

export function assertBackupSize(bytes: number): void {
  if (bytes > MAX_BACKUP_BYTES) throw new Error('The backup file must be 30 MB or smaller.');
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff
      && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}
