import { describe, expect, it, vi } from 'vitest';
import { MAX_ARCHIVE_ATTACHMENT_BYTES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_DOCUMENT } from '../core/archive';
import type { ArchiveData, ArchiveDocument, Attachment, DocumentInput } from '../core/types';
import { getCopy } from '../i18n';
import { appendOcrResult, checkAttachmentLimits, UnsavedAttachments } from './attachmentLifecycle';

vi.mock('expo-crypto', () => ({ randomUUID: () => 'test-id' }));

const file = (id: string, size = 100): Attachment => ({
  id, size, name: `${id}.png`, mimeType: 'image/png', uri: `file://${id}`,
});
const input: DocumentInput = {
  title: 'Test', categoryId: null, tagIds: [], schoolYear: '', className: '',
  studentName: '', reference: '', physicalLocation: '', notes: '', ocrText: 'Manual text',
  status: 'draft', attachments: [],
};
const document = (attachments: Attachment[]): ArchiveDocument => ({
  ...input, attachments, id: 'document', createdAt: '2026-10-29T12:00:00Z', updatedAt: '2026-10-29T12:00:00Z',
});
const archive = (documents: ArchiveDocument[] = []): ArchiveData => ({
  version: 1, documents, categories: [], tags: [], settings: { language: 'ro' },
});

describe('unsaved import ownership', () => {
  it('initial imports remain unsaved and are deleted when discarded', async () => {
    const imported = file('new');
    const unsaved = new UnsavedAttachments([imported], []);
    const remove = vi.fn().mockResolvedValue(undefined);
    expect(unsaved.size).toBe(1);
    await unsaved.cleanup(remove);
    expect(remove).toHaveBeenCalledWith(imported);
    expect(unsaved.size).toBe(0);
  });

  it('never deletes original document attachments or files committed by an OCR draft', async () => {
    const original = file('original');
    const imported = file('imported');
    const laterImport = file('later');
    const unsaved = new UnsavedAttachments([original, imported], [document([original])]);
    unsaved.markSaved([original, imported]);
    unsaved.track([laterImport]);
    const remove = vi.fn().mockResolvedValue(undefined);
    await unsaved.remove(original, remove);
    await unsaved.remove(imported, remove);
    await unsaved.cleanup(remove);
    expect(remove).toHaveBeenCalledExactlyOnceWith(laterImport);
  });

  it('immediately deletes a removed fresh file and never retries a successful deletion', async () => {
    const imported = file('new');
    const unsaved = new UnsavedAttachments([imported], []);
    const remove = vi.fn().mockResolvedValue(undefined);
    await unsaved.remove(imported, remove);
    await unsaved.cleanup(remove);
    expect(remove).toHaveBeenCalledExactlyOnceWith(imported);
  });

  it('cleans rejected additions while retaining attachments still in the form', async () => {
    const retained = file('retained');
    const rejected = file('rejected');
    const unsaved = new UnsavedAttachments([retained], []);
    unsaved.track([rejected]);
    const remove = vi.fn().mockResolvedValue(undefined);
    await unsaved.cleanup(remove, [retained]);
    expect(remove).toHaveBeenCalledExactlyOnceWith(rejected);
    expect(unsaved.pending()).toEqual([retained]);
  });

  it('reports cleanup failures and preserves ownership for a retry', async () => {
    const failed = file('failed');
    const succeeded = file('succeeded');
    const unsaved = new UnsavedAttachments([failed, succeeded], []);
    const remove = vi.fn(async (attachment: Attachment) => {
      if (attachment.id === failed.id) throw new Error('Storage unavailable');
    });
    await expect(unsaved.cleanup(remove)).rejects.toThrow('failed.png: Storage unavailable');
    expect(unsaved.pending()).toEqual([failed]);
    const retry = vi.fn().mockResolvedValue(undefined);
    await unsaved.cleanup(retry);
    expect(retry).toHaveBeenCalledExactlyOnceWith(failed);
    expect(unsaved.size).toBe(0);
  });

  it('preserves a fresh attachment when individual removal fails', async () => {
    const imported = file('new');
    const unsaved = new UnsavedAttachments([imported], []);
    await expect(unsaved.remove(imported, vi.fn().mockRejectedValue(new Error('Denied')))).rejects.toThrow('Denied');
    expect(unsaved.pending()).toEqual([imported]);
  });
});

describe('attachment limits and OCR review state', () => {
  const copy = getCopy('en');

  it('uses shared per-file, document-count and archive limits', () => {
    expect(() => checkAttachmentLimits(archive(), [file('large', MAX_ATTACHMENT_BYTES + 1)], copy)).toThrow(copy.fileLimitError);
    expect(() => checkAttachmentLimits(archive(), Array.from({ length: MAX_ATTACHMENTS_PER_DOCUMENT + 1 }, (_, index) => file(String(index))), copy)).toThrow(copy.attachmentCountError);
    const full = archive([document([file('existing', MAX_ARCHIVE_ATTACHMENT_BYTES)])]);
    expect(() => checkAttachmentLimits(full, [file('new')], copy)).toThrow(copy.attachmentLimitError);
    expect(() => checkAttachmentLimits(full, [file('replacement')], copy, 'document')).not.toThrow();
  });

  it('appends extracted text and marks it as unverified, without changing its input', () => {
    expect(appendOcrResult(input, '  Extracted words  ')).toMatchObject({
      ocrText: 'Manual text\n\nExtracted words', status: 'review',
    });
    expect(input.status).toBe('draft');
    expect(input.ocrText).toBe('Manual text');
  });
});
