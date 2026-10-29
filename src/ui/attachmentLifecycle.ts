import {
  MAX_ARCHIVE_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_DOCUMENT,
} from '../core/archive';
import type { ArchiveData, ArchiveDocument, Attachment, DocumentInput } from '../core/types';
import type { Copy } from '../i18n';

export function checkAttachmentLimits(
  archive: ArchiveData, attachments: Attachment[], copy: Copy, documentId?: string,
): void {
  if (attachments.length > MAX_ATTACHMENTS_PER_DOCUMENT) throw new Error(copy.attachmentCountError);
  if (attachments.some(file => file.size > MAX_ATTACHMENT_BYTES)) throw new Error(copy.fileLimitError);
  const otherBytes = archive.documents
    .filter(document => document.id !== documentId)
    .reduce((sum, document) => sum + document.attachments.reduce((total, file) => total + file.size, 0), 0);
  if (otherBytes + attachments.reduce((sum, file) => sum + file.size, 0) > MAX_ARCHIVE_ATTACHMENT_BYTES) {
    throw new Error(copy.attachmentLimitError);
  }
}

/** Owns only imported files that have never been committed to document metadata. */
export class UnsavedAttachments {
  private readonly files = new Map<string, Attachment>();
  private readonly committed = new Set<string>();

  constructor(imported: Attachment[], savedDocuments: ArchiveDocument[]) {
    this.markSaved(savedDocuments.flatMap(document => document.attachments));
    this.track(imported);
  }

  get size(): number {
    return this.files.size;
  }

  pending(): Attachment[] {
    return [...this.files.values()];
  }

  track(attachments: Attachment[]): void {
    for (const attachment of attachments) {
      if (!this.committed.has(attachment.id)) this.files.set(attachment.id, attachment);
    }
  }

  markSaved(attachments: Attachment[]): void {
    for (const attachment of attachments) {
      this.committed.add(attachment.id);
      this.files.delete(attachment.id);
    }
  }

  async cleanup(
    remove: (attachment: Attachment) => Promise<void>,
    keep: Attachment[] = [],
  ): Promise<void> {
    const retained = new Set(keep.map(attachment => attachment.id));
    const failures: string[] = [];
    for (const [id, attachment] of this.files) {
      if (retained.has(id)) continue;
      try {
        await remove(attachment);
        this.files.delete(id);
      } catch (reason) {
        failures.push(`${attachment.name}: ${reason instanceof Error ? reason.message : String(reason)}`);
      }
    }
    if (failures.length) throw new Error(failures.join('\n'));
  }

  async remove(attachment: Attachment, remove: (attachment: Attachment) => Promise<void>): Promise<void> {
    if (!this.files.has(attachment.id)) return;
    await remove(attachment);
    this.files.delete(attachment.id);
  }
}

export function appendOcrResult(input: DocumentInput, text: string): DocumentInput {
  return {
    ...input,
    status: 'review',
    ocrText: [input.ocrText.trimEnd(), text.trim()].filter(Boolean).join('\n\n'),
  };
}
