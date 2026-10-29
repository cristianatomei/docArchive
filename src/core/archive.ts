import { randomUUID } from 'expo-crypto';

import type {
  ArchiveBackup,
  ArchiveData,
  ArchiveDocument,
  DocumentInput,
  DocumentStatus,
  TaxonomyItem,
} from './types';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ARCHIVE_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_BACKUP_ATTACHMENT_BYTES = MAX_ARCHIVE_ATTACHMENT_BYTES;
export const MAX_DOCUMENTS = 10_000;
export const MAX_TAXONOMY_ITEMS = 1_000;
export const MAX_ATTACHMENTS_PER_DOCUMENT = 20;
export const MAX_ARCHIVE_JSON_BYTES = 30 * 1024 * 1024;
export const MAX_BACKUP_JSON_BYTES = 30 * 1024 * 1024;

const DOCUMENT_KEYS = [
  'id', 'title', 'categoryId', 'tagIds', 'schoolYear', 'className', 'studentName',
  'reference', 'physicalLocation', 'notes', 'ocrText', 'status', 'attachments',
  'createdAt', 'updatedAt',
];
const STATUSES: DocumentStatus[] = ['draft', 'review', 'archived'];

function fail(message: string): never {
  throw new Error(`Invalid archive: ${message}`);
}

function object(value: unknown, keys: string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail(`${path} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length ||
      keys.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) {
    return fail(`${path} has missing or unexpected fields.`);
  }
  return record;
}

function text(value: unknown, path: string, maximum = 1_000, required = false): string {
  if (typeof value !== 'string' || value.length > maximum ||
      (required && !value.trim()) || /\u0000/.test(value)) {
    return fail(`${path} must be ${required ? 'nonempty ' : ''}text (maximum ${maximum} characters).`);
  }
  return value;
}

function id(value: unknown, path: string): string {
  const result = text(value, path, 128, true);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(result)) {
    return fail(`${path} contains unsupported ID characters.`);
  }
  return result;
}

function array(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    return fail(`${path} must be an array with at most ${maximum} entries.`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) fail(`${path} contains missing entries.`);
  }
  if (Object.keys(value).length !== value.length) fail(`${path} has unexpected properties.`);
  return value;
}

function unique(values: string[], path: string): void {
  if (new Set(values).size !== values.length) fail(`${path} contains duplicates.`);
}

function date(value: unknown, path: string): string {
  const result = text(value, path, 30, true);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(result)) {
    return fail(`${path} must be an ISO UTC timestamp.`);
  }
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 19) !== result.slice(0, 19)) {
    return fail(`${path} is not a valid date.`);
  }
  return result;
}

function mime(value: unknown, path: string): string {
  const result = text(value, path, 150, true);
  if (!/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(result)) {
    return fail(`${path} must be a MIME type.`);
  }
  return result;
}

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff &&
        value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function createEmptyArchive(): ArchiveData {
  return {
    version: 1,
    documents: [],
    categories: [
      { id: 'cat-catalogues', name: 'Cataloage', color: '#0891B2' },
      { id: 'cat-registers', name: 'Registre matricole', color: '#059669' },
      { id: 'cat-records', name: 'Fișe matricole', color: '#D97706' },
      { id: 'cat-students', name: 'Dosare de înscriere', color: '#7C3AED' },
      { id: 'cat-administrative', name: 'Documente administrative', color: '#2563EB' },
    ],
    tags: [],
    settings: { language: 'ro' },
  };
}

function taxonomy(value: unknown, path: string): TaxonomyItem[] {
  const items = array(value, path, MAX_TAXONOMY_ITEMS).map((entry, index) => {
    const item = object(entry, ['id', 'name', 'color'], `${path}[${index}]`);
    const color = text(item.color, `${path}.color`, 7, true);
    if (!/^#[a-fA-F0-9]{6}$/.test(color)) fail(`${path}.color must be a six-digit hex color.`);
    return {
      id: id(item.id, `${path}.id`),
      name: text(item.name, `${path}.name`, 120, true),
      color,
    };
  });
  unique(items.map((item) => item.id), `${path} IDs`);
  unique(items.map((item) => normalizeSearch(item.name)), `${path} names`);
  return items;
}

/** Validate without repairing, dropping fields, or replacing corrupt data with an empty archive. */
export function validateArchive(value: unknown): ArchiveData {
  const root = object(value, ['version', 'documents', 'categories', 'tags', 'settings'], 'archive');
  if (root.version !== 1) fail('unsupported archive version.');
  const settings = object(root.settings, ['language'], 'settings');
  if (settings.language !== 'ro' && settings.language !== 'en') fail('unsupported language.');
  const categories = taxonomy(root.categories, 'categories');
  const tags = taxonomy(root.tags, 'tags');
  const categoryIds = new Set(categories.map((item) => item.id));
  const tagIds = new Set(tags.map((item) => item.id));
  const attachmentIds: string[] = [];
  let attachmentBytes = 0;
  let documentJsonBytes = 0;
  const documents = array(root.documents, 'documents', MAX_DOCUMENTS).map((entry, index) => {
    const path = `documents[${index}]`;
    const item = object(entry, DOCUMENT_KEYS, path);
    const documentId = id(item.id, `${path}.id`);
    const categoryId = item.categoryId === null ? null : id(item.categoryId, `${path}.categoryId`);
    if (categoryId !== null && !categoryIds.has(categoryId)) fail(`${path} references a missing category.`);
    const documentTagIds = array(item.tagIds, `${path}.tagIds`, MAX_TAXONOMY_ITEMS)
      .map((value) => id(value, `${path}.tagIds`));
    unique(documentTagIds, `${path}.tagIds`);
    if (documentTagIds.some((tagId) => !tagIds.has(tagId))) fail(`${path} references a missing tag.`);
    if (!STATUSES.includes(item.status as DocumentStatus)) fail(`${path} has an invalid status.`);
    const createdAt = date(item.createdAt, `${path}.createdAt`);
    const updatedAt = date(item.updatedAt, `${path}.updatedAt`);
    if (Date.parse(updatedAt) < Date.parse(createdAt)) fail(`${path}.updatedAt precedes createdAt.`);
    const attachments = array(item.attachments, `${path}.attachments`, MAX_ATTACHMENTS_PER_DOCUMENT)
      .map((entry, attachmentIndex) => {
        const attachmentPath = `${path}.attachments[${attachmentIndex}]`;
        const attachment = object(entry, ['id', 'name', 'mimeType', 'size', 'uri'], attachmentPath);
        const attachmentId = id(attachment.id, `${attachmentPath}.id`);
        attachmentIds.push(attachmentId);
        if (typeof attachment.size !== 'number' || !Number.isSafeInteger(attachment.size) ||
            attachment.size < 0 || attachment.size > MAX_ATTACHMENT_BYTES) {
          fail(`${attachmentPath}.size must be between 0 and ${MAX_ATTACHMENT_BYTES} bytes.`);
        }
        attachmentBytes += attachment.size;
        if (attachmentBytes > MAX_ARCHIVE_ATTACHMENT_BYTES) {
          fail(`total attachments exceed ${MAX_ARCHIVE_ATTACHMENT_BYTES} bytes.`);
        }
        return {
          id: attachmentId,
          name: text(attachment.name, `${attachmentPath}.name`, 255, true),
          mimeType: mime(attachment.mimeType, `${attachmentPath}.mimeType`),
          size: attachment.size,
          uri: text(attachment.uri, `${attachmentPath}.uri`, 4_096, true),
        };
      });
    const document: ArchiveDocument = {
      id: documentId,
      title: text(item.title, `${path}.title`, 200, true),
      categoryId,
      tagIds: documentTagIds,
      schoolYear: text(item.schoolYear, `${path}.schoolYear`, 100),
      className: text(item.className, `${path}.className`, 100),
      studentName: text(item.studentName, `${path}.studentName`, 200),
      reference: text(item.reference, `${path}.reference`),
      physicalLocation: text(item.physicalLocation, `${path}.physicalLocation`),
      notes: text(item.notes, `${path}.notes`, 100_000),
      ocrText: text(item.ocrText, `${path}.ocrText`, 1_000_000),
      status: item.status as DocumentStatus,
      attachments,
      createdAt,
      updatedAt,
    };
    documentJsonBytes += utf8Bytes(JSON.stringify(document)) + 1;
    if (documentJsonBytes > MAX_ARCHIVE_JSON_BYTES) {
      fail(`archive JSON exceeds ${MAX_ARCHIVE_JSON_BYTES} bytes.`);
    }
    return document;
  });
  unique(documents.map((document) => document.id), 'document IDs');
  unique(attachmentIds, 'attachment IDs');
  const archive: ArchiveData = {
    version: 1, documents, categories, tags, settings: { language: settings.language },
  };
  if (utf8Bytes(JSON.stringify(archive)) > MAX_ARCHIVE_JSON_BYTES) {
    fail(`archive JSON exceeds ${MAX_ARCHIVE_JSON_BYTES} bytes.`);
  }
  return archive;
}

export interface SearchFilters {
  categoryId?: string;
  tagId?: string;
  status?: DocumentStatus;
}

export function searchDocuments(
  archive: ArchiveData,
  query: string,
  filters: SearchFilters = {},
): ArchiveDocument[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const categories = new Map(archive.categories.map((item) => [item.id, item.name]));
  const tags = new Map(archive.tags.map((item) => [item.id, item.name]));
  return archive.documents.filter((document) => {
    if (filters.categoryId !== undefined && document.categoryId !== filters.categoryId) return false;
    if (filters.tagId !== undefined && !document.tagIds.includes(filters.tagId)) return false;
    if (filters.status !== undefined && document.status !== filters.status) return false;
    const content = normalizeSearch([
      document.title, document.studentName, document.schoolYear, document.className,
      document.reference, document.physicalLocation, document.notes, document.ocrText,
      document.categoryId ? categories.get(document.categoryId) ?? '' : '',
      ...document.tagIds.map((tagId) => tags.get(tagId) ?? ''),
    ].join(' '));
    return terms.every((term) => content.includes(term));
  });
}

export function upsertDocument(
  archive: ArchiveData,
  input: DocumentInput,
  documentId?: string,
): { archive: ArchiveData; document: ArchiveDocument } {
  const current = validateArchive(archive);
  const previous = documentId === undefined ? undefined : current.documents.find((item) => item.id === documentId);
  if (documentId !== undefined && !previous) throw new Error('Document not found.');
  const now = new Date().toISOString();
  const document: ArchiveDocument = {
    ...input,
    title: text(typeof input.title === 'string' ? input.title.trim() : input.title, 'title', 200, true),
    id: previous?.id ?? randomUUID(),
    createdAt: previous?.createdAt ?? now,
    updatedAt: previous && previous.updatedAt > now ? previous.updatedAt : now,
  };
  const next = validateArchive({
    ...current,
    documents: previous
      ? current.documents.map((item) => item.id === previous.id ? document : item)
      : [...current.documents, document],
  });
  return { archive: next, document: next.documents.find((item) => item.id === document.id)! };
}

export function upsertTaxonomy(
  archive: ArchiveData,
  kind: 'categories' | 'tags',
  name: string,
  itemId?: string,
): ArchiveData {
  const current = validateArchive(archive);
  if (kind !== 'categories' && kind !== 'tags') throw new Error('Invalid taxonomy kind.');
  const trimmedName = text(name, 'name', 120, true).trim();
  const previous = itemId === undefined ? undefined : current[kind].find((item) => item.id === itemId);
  if (itemId !== undefined && !previous) throw new Error('Category or tag not found.');
  if (current[kind].some((item) =>
    item.id !== itemId && normalizeSearch(item.name) === normalizeSearch(trimmedName))) {
    throw new Error('A category or tag with this name already exists.');
  }
  const item: TaxonomyItem = {
    id: previous?.id ?? randomUUID(),
    name: trimmedName,
    color: previous?.color ?? (kind === 'categories' ? '#2563EB' : '#64748B'),
  };
  return validateArchive({
    ...current,
    [kind]: previous
      ? current[kind].map((entry) => entry.id === item.id ? item : entry)
      : [...current[kind], item],
  });
}

/** Referenced categories/tags must be removed from documents before they can be deleted. */
export function deleteTaxonomy(
  archive: ArchiveData,
  kind: 'categories' | 'tags',
  itemId: string,
): ArchiveData {
  const current = validateArchive(archive);
  if (kind !== 'categories' && kind !== 'tags') throw new Error('Invalid taxonomy kind.');
  if (!current[kind].some((item) => item.id === itemId)) throw new Error('Category or tag not found.');
  if (current.documents.some((item) =>
    kind === 'categories' ? item.categoryId === itemId : item.tagIds.includes(itemId))) {
    throw new Error('Category or tag is in use. Remove it from documents before deleting it.');
  }
  return { ...current, [kind]: current[kind].filter((item) => item.id !== itemId) };
}

export function deleteDocument(archive: ArchiveData, documentId: string): ArchiveData {
  const current = validateArchive(archive);
  if (!current.documents.some((item) => item.id === documentId)) throw new Error('Document not found.');
  return { ...current, documents: current.documents.filter((item) => item.id !== documentId) };
}

export function validateBackup(value: unknown): ArchiveBackup {
  const root = object(value, ['format', 'version', 'exportedAt', 'archive', 'files'], 'backup');
  if (root.format !== 'docarchive-backup' || root.version !== 1) fail('unsupported backup format or version.');
  const exportedAt = date(root.exportedAt, 'backup.exportedAt');
  const archive = validateArchive(root.archive);
  const attachments = new Map(archive.documents.flatMap((document) =>
    document.attachments.map((attachment) => [attachment.id, attachment] as const)));
  const fileIds: string[] = [];
  let totalBytes = 0;
  const files = array(root.files, 'backup.files', MAX_DOCUMENTS * MAX_ATTACHMENTS_PER_DOCUMENT)
    .map((entry, index) => {
      const path = `backup.files[${index}]`;
      const file = object(entry, ['id', 'name', 'mimeType', 'base64'], path);
      const fileId = id(file.id, `${path}.id`);
      fileIds.push(fileId);
      const attachment = attachments.get(fileId);
      if (!attachment) fail(`${path} does not match an attachment.`);
      const name = text(file.name, `${path}.name`, 255, true);
      const mimeType = mime(file.mimeType, `${path}.mimeType`);
      if (name !== attachment.name || mimeType !== attachment.mimeType) {
        fail(`${path} metadata does not match its attachment.`);
      }
      const base64 = text(file.base64, `${path}.base64`, Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4);
      // Canonical padded base64 only; also reject nonzero unused bits in the last sextet.
      if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
          (/==$/.test(base64) && !/[AQgw]==$/.test(base64)) ||
          (/[^=]=$/.test(base64) && !/[AEIMQUYcgkosw048]=$/.test(base64))) {
        fail(`${path}.base64 is invalid.`);
      }
      const bytes = base64.length / 4 * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
      if (bytes !== attachment.size) fail(`${path} byte size does not match its attachment.`);
      totalBytes += bytes;
      if (totalBytes > MAX_BACKUP_ATTACHMENT_BYTES) fail('backup attachments exceed the 20 MiB limit.');
      return { id: fileId, name, mimeType, base64 };
    });
  unique(fileIds, 'backup file IDs');
  if (files.length !== attachments.size) fail('backup is missing attachment files.');
  const backup: ArchiveBackup = { format: 'docarchive-backup', version: 1, exportedAt, archive, files };
  if (utf8Bytes(JSON.stringify(backup)) > MAX_BACKUP_JSON_BYTES) fail('backup JSON exceeds its size limit.');
  return backup;
}
