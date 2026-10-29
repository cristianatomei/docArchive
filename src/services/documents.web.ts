import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { Attachment, BackupAttachment } from '../core/types';
import {
  ATTACHMENT_MIME_TYPES, assertAttachmentSize, assertBackupSize, assertStorageId,
  attachmentMimeType, backupByteLength,
} from './attachmentValidation';

const DATABASE = 'docarchive-files';
const STORE = 'attachments';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Browser file storage is unavailable. Enable IndexedDB or use a supported browser.'));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(new Error(`Could not open browser file storage: ${request.error?.message ?? 'access denied'}`));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Browser file storage is blocked. Close other docArchive tabs and retry.'));
    };
  });
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(new Error(`Browser file storage failed: ${transaction.error?.message ?? request.error?.message ?? 'storage quota or access denied'}`));
      transaction.onerror = () => reject(new Error(`Browser file storage failed: ${transaction.error?.message ?? 'storage quota or access denied'}`));
    });
  } finally {
    db.close();
  }
}

function storageId(attachment: Attachment): string {
  assertStorageId(attachment.id);
  if (attachment.uri !== `idb://${attachment.id}`) throw new Error('The attachment does not belong to this archive storage.');
  return attachment.id;
}

async function storeBlob(blob: Blob, name: string, mimeType?: string | null): Promise<Attachment> {
  assertAttachmentSize(blob.size);
  const mime = attachmentMimeType(name, mimeType || blob.type);
  const id = randomUUID();
  await transact('readwrite', store => store.add(blob, id));
  return { id, name, mimeType: mime, size: blob.size, uri: `idb://${id}` };
}

async function readBlob(attachment: Attachment): Promise<Blob> {
  const blob = await transact<Blob | undefined>('readonly', store => store.get(storageId(attachment)));
  if (!blob) throw new Error(`Attachment "${attachment.name}" is missing from browser storage. Restore a backup or import it again.`);
  return blob;
}

async function pickedBlob(asset: { file?: File; uri: string }): Promise<Blob> {
  if (asset.file) return asset.file;
  // Only transient browser picker URLs are accepted; never fetch remote documents.
  if (!asset.uri.startsWith('blob:') && !asset.uri.startsWith('data:')) throw new Error('The browser did not provide a readable local file.');
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error('The selected browser file could not be read.');
  return response.blob();
}

export async function pickDocumentAttachments(): Promise<Attachment[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: ATTACHMENT_MIME_TYPES, multiple: true, base64: false });
  if (result.canceled) return [];
  const attachments: Attachment[] = [];
  try {
    for (const asset of result.assets) attachments.push(await storeBlob(await pickedBlob(asset), asset.name, asset.mimeType));
    return attachments;
  } catch (error) {
    await Promise.all(attachments.map(removeStoredAttachment));
    throw error;
  }
}

export async function captureDocumentPhoto(): Promise<Attachment | null> {
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return storeBlob(await pickedBlob(asset), asset.fileName ?? `capture-${Date.now()}.jpg`, asset.mimeType ?? 'image/jpeg');
}

export function ocrSupported(): boolean {
  return false;
}

export async function extractAttachmentText(attachment: Attachment): Promise<string> {
  if (!attachmentMimeType(attachment.name, attachment.mimeType).startsWith('image/')) {
    throw new Error('Offline OCR supports images only. Import a photo or screenshot of the PDF page.');
  }
  throw new Error('Offline OCR is unavailable in browsers. Use a native docArchive build, or enter the document text manually.');
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Downloads and new tabs consume the URL asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function openAttachment(attachment: Attachment): Promise<void> {
  download(await readBlob(attachment), attachment.name);
}

export async function readAttachmentBackup(attachment: Attachment): Promise<BackupAttachment> {
  const blob = await readBlob(attachment);
  assertAttachmentSize(blob.size);
  if (blob.size !== attachment.size) throw new Error(`Attachment "${attachment.name}" no longer matches its saved size. Import it again before exporting.`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return { id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, base64: btoa(binary) };
}

export async function restoreAttachment(backup: BackupAttachment): Promise<Attachment> {
  backupByteLength(backup);
  const binary = atob(backup.base64);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return storeBlob(new Blob([bytes], { type: backup.mimeType }), backup.name, backup.mimeType);
}

export async function removeStoredAttachment(attachment: Attachment): Promise<void> {
  await transact('readwrite', store => store.delete(storageId(attachment)));
}

export async function saveBackupFile(serialized: string): Promise<void> {
  const blob = new Blob([serialized], { type: 'application/json' });
  assertBackupSize(blob.size);
  download(blob, `docarchive-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

export async function pickBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/json', 'text/plain'], base64: false });
  if (result.canceled) return null;
  const blob = await pickedBlob(result.assets[0]);
  assertBackupSize(blob.size);
  return blob.text();
}
