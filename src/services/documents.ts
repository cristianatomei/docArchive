import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { Attachment, BackupAttachment } from '../core/types';
import {
  ATTACHMENT_MIME_TYPES, assertAttachmentSize, assertBackupSize, assertStorageId,
  attachmentMimeType, backupByteLength, storageExtension, utf8ByteLength,
} from './attachmentValidation';

function directory(): Directory {
  const result = new Directory(Paths.document, 'attachments');
  result.create({ intermediates: true, idempotent: true });
  return result;
}

function storedFile(attachment: Attachment): File {
  assertStorageId(attachment.id);
  const mime = attachmentMimeType(attachment.name, attachment.mimeType);
  const file = new File(directory(), `${attachment.id}.${storageExtension(mime)}`);
  if (attachment.uri !== file.uri) throw new Error('The attachment does not belong to this archive storage.');
  return file;
}

async function storePickedFile(uri: string, name: string, suppliedMime?: string | null): Promise<Attachment> {
  const mimeType = attachmentMimeType(name, suppliedMime);
  const source = new File(uri);
  assertAttachmentSize(source.size);
  const id = randomUUID();
  const destination = new File(directory(), `${id}.${storageExtension(mimeType)}`);
  try {
    source.copy(destination);
    assertAttachmentSize(destination.size);
    return { id, name, mimeType, size: destination.size, uri: destination.uri };
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }
}

export async function pickDocumentAttachments(): Promise<Attachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ATTACHMENT_MIME_TYPES, multiple: true, copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  const attachments: Attachment[] = [];
  try {
    for (const asset of result.assets) {
      attachments.push(await storePickedFile(asset.uri, asset.name, asset.mimeType));
    }
    return attachments;
  } catch (error) {
    await Promise.all(attachments.map(removeStoredAttachment));
    throw error;
  }
}

export async function captureDocumentPhoto(): Promise<Attachment | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Camera permission is required. Enable it in system settings, or import an image instead.');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const name = asset.fileName ?? `capture-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
  return storePickedFile(asset.uri, name, asset.mimeType ?? 'image/jpeg');
}

interface TextExtractorModule {
  isSupported: boolean;
  extractTextFromImage(uri: string): Promise<string[]>;
}

function textExtractor(): TextExtractorModule | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  return requireOptionalNativeModule<TextExtractorModule>('DocArchiveOcr');
}

export function ocrSupported(): boolean {
  return textExtractor()?.isSupported === true;
}

export async function extractAttachmentText(attachment: Attachment): Promise<string> {
  const mime = attachmentMimeType(attachment.name, attachment.mimeType);
  if (!mime.startsWith('image/')) throw new Error('Offline OCR supports images only. Import a photo or screenshot of the PDF page.');
  const extractor = textExtractor();
  if (!extractor?.isSupported) throw new Error('Offline OCR requires a native development or production build with the OCR module. It is unavailable in Expo Go and browsers; enter text manually.');
  const file = storedFile(attachment);
  if (!file.exists) throw new Error('The attachment file is missing. Restore it from a backup or import it again.');
  try {
    return (await extractor.extractTextFromImage(file.uri)).join('\n').trim();
  } catch (error) {
    throw new Error(`OCR could not read this image. Try a clear, upright photo of printed text, or enter text manually. ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function openAttachment(attachment: Attachment): Promise<void> {
  const file = storedFile(attachment);
  if (!file.exists) throw new Error('The attachment file is missing. Restore it from a backup or import it again.');
  if (await file.canPreview({ mimeType: attachment.mimeType })) {
    await file.preview({ title: attachment.name, mimeType: attachment.mimeType });
    return;
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('This device cannot open or share this attachment.');
  await Sharing.shareAsync(file.uri, { mimeType: attachment.mimeType, dialogTitle: attachment.name });
}

export async function readAttachmentBackup(attachment: Attachment): Promise<BackupAttachment> {
  const file = storedFile(attachment);
  if (!file.exists) throw new Error(`Attachment "${attachment.name}" is missing. Restore it or remove it before exporting.`);
  assertAttachmentSize(file.size);
  if (file.size !== attachment.size) throw new Error(`Attachment "${attachment.name}" no longer matches its saved size. Import it again before exporting.`);
  const backup = { id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, base64: await file.base64() };
  if (backupByteLength(backup) !== attachment.size) throw new Error(`Attachment "${attachment.name}" changed while exporting. Retry the backup.`);
  return backup;
}

export async function restoreAttachment(backup: BackupAttachment): Promise<Attachment> {
  const size = backupByteLength(backup);
  const id = randomUUID();
  const mimeType = attachmentMimeType(backup.name, backup.mimeType);
  const file = new File(directory(), `${id}.${storageExtension(mimeType)}`);
  try {
    file.create();
    file.write(backup.base64, { encoding: 'base64' });
    if (file.size !== size) throw new Error('The restored attachment size does not match the backup.');
    return { id, name: backup.name, mimeType, size, uri: file.uri };
  } catch (error) {
    if (file.exists) file.delete();
    throw error;
  }
}

export async function removeStoredAttachment(attachment: Attachment): Promise<void> {
  const file = storedFile(attachment);
  if (file.exists) file.delete();
}

export async function saveBackupFile(serialized: string): Promise<void> {
  assertBackupSize(utf8ByteLength(serialized));
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device. Try another supported device to export a backup.');
  const file = new File(Paths.cache, `docarchive-backup-${randomUUID()}.json`);
  try {
    file.create();
    file.write(serialized);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save docArchive backup' });
  } finally {
    if (file.exists) file.delete();
  }
}

export async function pickBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/json', 'text/plain'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  assertBackupSize(file.size);
  return file.text();
}
