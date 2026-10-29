import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'expo-crypto';

import {
  createEmptyArchive, deleteDocument, deleteTaxonomy, MAX_ARCHIVE_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_BYTES, normalizeSearch, searchDocuments, upsertDocument,
  upsertTaxonomy, validateArchive, validateBackup,
} from './archive';
import type { ArchiveBackup, ArchiveData, DocumentInput } from './types';

vi.mock('expo-crypto', () => ({ randomUUID: vi.fn() }));

function input(overrides: Partial<DocumentInput> = {}): DocumentInput {
  return {
    title: '  Situație școlară  ',
    categoryId: 'cat-students',
    tagIds: [],
    schoolYear: '2025–2026',
    className: 'VIII B',
    studentName: 'Ștefan Țepeș',
    reference: 'REG-48',
    physicalLocation: 'Dulap 3',
    notes: 'Original semnat',
    ocrText: 'Înscriere aprobată',
    status: 'draft',
    attachments: [],
    ...overrides,
  };
}

function archiveWithDocument(): ArchiveData {
  return upsertDocument(createEmptyArchive(), input()).archive;
}

function backup(): ArchiveBackup {
  return {
    format: 'docarchive-backup',
    version: 1,
    exportedAt: '2026-10-29T10:00:00.000Z',
    archive: upsertDocument(createEmptyArchive(), input({
      attachments: [{ id: 'file-1', name: 'scan.jpg', mimeType: 'image/jpeg', size: 2, uri: 'file:///scan.jpg' }],
    })).archive,
    files: [{ id: 'file-1', name: 'scan.jpg', mimeType: 'image/jpeg', base64: 'aGk=' }],
  };
}

beforeEach(() => {
  let count = 0;
  vi.mocked(randomUUID).mockImplementation(() => `generated-${++count}`);
});

describe('archive validation and mutations', () => {
  it('creates independent Romanian school archives with no sample documents', () => {
    const first = createEmptyArchive();
    expect(first.settings.language).toBe('ro');
    expect(first.documents).toEqual([]);
    expect(first.categories.map((category) => category.name)).toEqual([
      'Cataloage', 'Registre matricole', 'Fișe matricole',
      'Dosare de înscriere', 'Documente administrative',
    ]);
    expect(validateArchive(first)).toEqual(first);
    first.categories[0].name = 'changed';
    expect(createEmptyArchive().categories[0].name).not.toBe('changed');
  });

  it('trims titles, preserves IDs/creation dates, never mutates its input, and deletes documents', () => {
    const original = createEmptyArchive();
    const created = upsertDocument(original, input());
    expect(original.documents).toEqual([]);
    expect(created.document.title).toBe('Situație școlară');
    const updated = upsertDocument(created.archive, input({ title: 'Renamed' }), created.document.id);
    expect(updated.document.id).toBe(created.document.id);
    expect(updated.document.createdAt).toBe(created.document.createdAt);
    expect(updated.document.updatedAt >= updated.document.createdAt).toBe(true);
    expect(updated.archive.documents).toHaveLength(1);
    expect(deleteDocument(updated.archive, updated.document.id).documents).toEqual([]);
    expect(() => upsertDocument(original, input(), 'missing')).toThrow('not found');
    expect(() => deleteDocument(original, 'missing')).toThrow('not found');
    expect(() => upsertDocument(original, input({ title: '   ' }))).toThrow('title');
  });

  it('renames taxonomies with stable IDs/colors and rejects normalized duplicates and in-use deletion', () => {
    const first = upsertTaxonomy(createEmptyArchive(), 'tags', 'Ședință');
    expect(() => upsertTaxonomy(first, 'tags', ' SEDINTA ')).toThrow('already exists');
    const tag = first.tags[0];
    const renamed = upsertTaxonomy(first, 'tags', 'Consiliu', tag.id);
    expect(renamed.tags[0]).toEqual({ ...tag, name: 'Consiliu' });
    const used = upsertDocument(renamed, input({ tagIds: [tag.id] })).archive;
    expect(() => deleteTaxonomy(used, 'tags', tag.id)).toThrow('in use');
    expect(() => deleteTaxonomy(used, 'categories', 'cat-students')).toThrow('in use');
    expect(deleteTaxonomy(first, 'tags', tag.id).tags).toEqual([]);
    expect(() => upsertTaxonomy(first, 'tags', 'x', 'missing')).toThrow('not found');
  });

  it.each([
    ['unsupported version', (a: any) => { a.version = 2; }],
    ['unexpected fields', (a: any) => { a.extra = true; }],
    ['missing fields', (a: any) => { delete a.settings; }],
    ['invalid language', (a: any) => { a.settings.language = 'fr'; }],
    ['duplicate documents', (a: any) => { a.documents.push(a.documents[0]); }],
    ['duplicate categories', (a: any) => { a.categories.push(a.categories[0]); }],
    ['duplicate normalized names', (a: any) => { a.categories.push({ ...a.categories[0], id: 'other' }); }],
    ['dangling category', (a: any) => { a.documents[0].categoryId = 'missing'; }],
    ['dangling tag', (a: any) => { a.documents[0].tagIds = ['missing']; }],
    ['invalid status', (a: any) => { a.documents[0].status = 'deleted'; }],
    ['invalid calendar date', (a: any) => { a.documents[0].createdAt = '2026-02-30T00:00:00.000Z'; }],
    ['date without timezone', (a: any) => { a.documents[0].createdAt = '2026-01-01'; }],
    ['reversed dates', (a: any) => { a.documents[0].createdAt = '2099-01-01T00:00:00.000Z'; }],
    ['invalid color', (a: any) => { a.categories[0].color = 'red'; }],
    ['empty title', (a: any) => { a.documents[0].title = ' '; }],
  ])('rejects %s instead of silently resetting', (_name, corrupt) => {
    const archive = archiveWithDocument();
    corrupt(archive);
    expect(() => validateArchive(archive)).toThrow('Invalid archive');
  });

  it('checks duplicate tag references and attachment IDs across documents', () => {
    const tagged = upsertTaxonomy(createEmptyArchive(), 'tags', 'Test');
    expect(() => upsertDocument(tagged, input({ tagIds: [tagged.tags[0].id, tagged.tags[0].id] })))
      .toThrow('duplicates');
    const archive = backup().archive;
    expect(() => upsertDocument(archive, input({ attachments: archive.documents[0].attachments })))
      .toThrow('attachment IDs');
  });

  it('rejects sparse arrays rather than creating invalid JSON snapshots', () => {
    const archive = createEmptyArchive();
    archive.documents = new Array(1);
    expect(() => validateArchive(archive)).toThrow('missing entries');
  });

  it('rejects invalid metadata, individual oversized files and aggregate size overflow', () => {
    const attachment = backup().archive.documents[0].attachments[0];
    for (const change of [
      { size: -1 }, { size: 0.1 }, { size: Infinity }, { size: MAX_ATTACHMENT_BYTES + 1 },
      { mimeType: 'not-mime' }, { uri: '' }, { name: '' },
    ]) {
      expect(() => upsertDocument(createEmptyArchive(), input({ attachments: [{ ...attachment, ...change }] })))
        .toThrow('Invalid archive');
    }
    expect(() => upsertDocument(createEmptyArchive(), input({
      attachments: Array.from({ length: 3 }, (_, i) => ({
        ...attachment, id: `file-${i}`, size: MAX_ATTACHMENT_BYTES,
      })),
    }))).toThrow(`exceed ${MAX_ARCHIVE_ATTACHMENT_BYTES}`);
  });
});

describe('search', () => {
  it('folds Romanian comma and cedilla characters and combining accents', () => {
    expect(normalizeSearch(' ȘȚ șț ŞŢ şţ ĂÂÎ é ')).toBe('st st st st aai e');
    expect(normalizeSearch('s\u0326t\u0326')).toBe('st');
  });

  it('searches all metadata, OCR, category/tag names, with AND terms and optional filters', () => {
    const tagged = upsertTaxonomy(createEmptyArchive(), 'tags', 'Urgență');
    const archive = upsertDocument(tagged, input({ tagIds: [tagged.tags[0].id], status: 'review' })).archive;
    for (const query of [
      'situatie', 'STEFAN TEPES', '2025', 'viii', 'reg-48', 'dulap', 'original',
      'inscriere aprobata', 'dosare de inscriere', 'urgenta',
    ]) {
      expect(searchDocuments(archive, query)).toHaveLength(1);
    }
    expect(searchDocuments(archive, 'stefan urgenta')).toHaveLength(1);
    expect(searchDocuments(archive, 'stefan missing')).toHaveLength(0);
    expect(searchDocuments(archive, '', { status: 'draft' })).toHaveLength(0);
    expect(searchDocuments(archive, '', { categoryId: 'other' })).toHaveLength(0);
    expect(searchDocuments(archive, '', { tagId: 'other' })).toHaveLength(0);
    expect(searchDocuments(archive, '', {
      categoryId: 'cat-students', tagId: tagged.tags[0].id, status: 'review',
    })).toHaveLength(1);
  });
});

describe('backup validation', () => {
  it('accepts complete backups and does not change local URIs', () => {
    const original = backup();
    expect(validateBackup(original)).toEqual(original);
    expect(validateBackup({
      ...original, archive: createEmptyArchive(), files: [],
    }).files).toEqual([]);
  });

  it.each([
    ['', 'size'], ['aA', 'base64'], ['aGk=\n', 'base64'], ['!!!!', 'base64'],
    ['aGk_', 'base64'], ['aGl=', 'base64'], ['aB==', 'base64'], ['aGkA', 'size'],
  ])('rejects invalid base64 or byte counts: %j', (base64, error) => {
    const value = backup();
    value.files[0].base64 = base64;
    expect(() => validateBackup(value)).toThrow(error);
  });

  it('requires exactly one matching file for every attachment and matching metadata', () => {
    const value = backup();
    expect(() => validateBackup({ ...value, files: [] })).toThrow('missing');
    expect(() => validateBackup({ ...value, files: [value.files[0], value.files[0]] })).toThrow('duplicates');
    expect(() => validateBackup({ ...value, files: [{ ...value.files[0], id: 'extra' }] })).toThrow('match');
    expect(() => validateBackup({ ...value, files: [{ ...value.files[0], name: 'wrong.jpg' }] }))
      .toThrow('metadata');
    expect(() => validateBackup({ ...value, version: 2 })).toThrow('unsupported');
    expect(() => validateBackup({ ...value, exportedAt: 'tomorrow' })).toThrow('timestamp');
  });

  it('validates a large canonical payload without recursive-regex stack overflow', () => {
    const value = backup();
    value.files[0].base64 = 'AAAA'.repeat(500_000);
    value.archive.documents[0].attachments[0].size = 1_500_000;
    expect(validateBackup(value).files[0].base64).toHaveLength(2_000_000);
  });
});
