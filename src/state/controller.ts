import {
  createEmptyArchive,
  deleteDocument,
  deleteTaxonomy,
  upsertDocument,
  upsertTaxonomy,
  validateArchive,
  validateBackup,
} from '../core/archive';
import type {
  ArchiveData, ArchiveDocument, Attachment, DocumentInput, Language,
} from '../core/types';

export interface ArchiveStorage {
  readArchive(): Promise<ArchiveData | null>;
  writeArchive(archive: ArchiveData): Promise<void>;
}

export interface ArchiveFiles {
  readAttachmentBackup: typeof import('../services/documents').readAttachmentBackup;
  restoreAttachment: typeof import('../services/documents').restoreAttachment;
  removeStoredAttachment: typeof import('../services/documents').removeStoredAttachment;
  saveBackupFile(serialized: string): Promise<void>;
  pickBackupFile(): Promise<string | null>;
}

export interface ControllerSnapshot {
  archive: ArchiveData;
  loading: boolean;
  busy: boolean;
  error: string | null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Serialize mutations and publish only after durable metadata commits. */
export class ArchiveController {
  private snapshot: ControllerSnapshot = {
    archive: createEmptyArchive(), loading: true, busy: false, error: null,
  };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private ready = false;
  private pending = 0;

  constructor(private storage: ArchiveStorage, private files: ArchiveFiles) {}

  getSnapshot = (): ControllerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(update: Partial<ControllerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) listener();
  }

  clearError = (): void => this.publish({ error: null });

  private run<T>(operation: () => Promise<T>): Promise<T> {
    this.pending += 1;
    this.publish({ busy: true });
    const result = this.queue.then(async () => {
      try {
        return await operation();
      } catch (error) {
        this.publish({ error: message(error) });
        throw error;
      } finally {
        this.pending -= 1;
        this.publish({ busy: this.pending > 0 });
      }
    });
    // Keep subsequent actions available after an explicitly reported failure.
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  reload = (): Promise<void> => this.run(async () => {
    this.publish({ loading: true, error: null });
    this.ready = false;
    try {
      const saved = await this.storage.readArchive();
      const archive = saved ?? createEmptyArchive();
      if (saved === null) await this.storage.writeArchive(archive);
      this.ready = true;
      this.publish({ archive });
    } finally {
      this.publish({ loading: false });
    }
  });

  private assertReady(): void {
    if (!this.ready) throw new Error('Archive is unavailable. Resolve the storage error and reload before making changes.');
  }

  private async commit(archive: ArchiveData): Promise<void> {
    this.assertReady();
    const checked = validateArchive(archive);
    await this.storage.writeArchive(checked);
    this.publish({ archive: checked, error: null });
  }

  private async cleanup(attachments: Attachment[], context: string): Promise<void> {
    const failures: string[] = [];
    for (const attachment of attachments) {
      try {
        await this.files.removeStoredAttachment(attachment);
      } catch (error) {
        failures.push(`${attachment.name}: ${message(error)}`);
      }
    }
    if (failures.length) {
      throw new Error(`${context} ${failures.length} unused file(s) could not be removed: ${failures.join('; ')}`);
    }
  }

  private async cleanupAfterCommit(attachments: Attachment[], context: string): Promise<void> {
    try {
      await this.cleanup(attachments, context);
    } catch (error) {
      // The record is already durable: report cleanup without making a retry create a duplicate.
      this.publish({ error: message(error) });
    }
  }

  saveDocument = (input: DocumentInput, id?: string): Promise<ArchiveDocument> => this.run(async () => {
    this.assertReady();
    const oldFiles = this.snapshot.archive.documents.find(document => document.id === id)?.attachments ?? [];
    const result = upsertDocument(this.snapshot.archive, input, id);
    await this.commit(result.archive);
    const retained = new Set(result.document.attachments.map(file => file.id));
    await this.cleanupAfterCommit(
      oldFiles.filter(file => !retained.has(file.id)),
      'Document saved, but file cleanup was incomplete.',
    );
    return result.document;
  });

  deleteDocument = (id: string): Promise<void> => this.run(async () => {
    this.assertReady();
    const attachments = this.snapshot.archive.documents.find(document => document.id === id)?.attachments ?? [];
    await this.commit(deleteDocument(this.snapshot.archive, id));
    await this.cleanupAfterCommit(attachments, 'Document deleted, but file cleanup was incomplete.');
  });

  saveTaxonomy = (kind: 'categories' | 'tags', name: string, id?: string): Promise<void> =>
    this.run(async () => {
      this.assertReady();
      await this.commit(upsertTaxonomy(this.snapshot.archive, kind, name, id));
    });

  deleteTaxonomy = (kind: 'categories' | 'tags', id: string): Promise<void> =>
    this.run(async () => {
      this.assertReady();
      await this.commit(deleteTaxonomy(this.snapshot.archive, kind, id));
    });

  setLanguage = (language: Language): Promise<void> => this.run(async () => {
    this.assertReady();
    await this.commit({ ...this.snapshot.archive, settings: { language } });
  });

  exportBackup = (): Promise<void> => this.run(async () => {
    this.assertReady();
    const archive = this.snapshot.archive;
    const files = [];
    for (const document of archive.documents) {
      for (const attachment of document.attachments) {
        files.push(await this.files.readAttachmentBackup(attachment));
      }
    }
    const backup = validateBackup({
      format: 'docarchive-backup', version: 1,
      exportedAt: new Date().toISOString(), archive, files,
    });
    await this.files.saveBackupFile(JSON.stringify(backup));
  });

  importBackup = (): Promise<boolean> => this.run(async () => {
    this.assertReady();
    const serialized = await this.files.pickBackupFile();
    if (serialized === null) return false;
    let value: unknown;
    try {
      value = JSON.parse(serialized);
    } catch {
      throw new Error('The selected file is not a valid JSON backup.');
    }
    const backup = validateBackup(value);
    const oldFiles = this.snapshot.archive.documents.flatMap(document => document.attachments);
    const staged: Attachment[] = [];
    let committed = false;
    try {
      const replacements = new Map<string, Attachment>();
      for (const file of backup.files) {
        const attachment = await this.files.restoreAttachment(file);
        staged.push(attachment);
        replacements.set(file.id, attachment);
      }
      const restored = validateArchive({
        ...backup.archive,
        documents: backup.archive.documents.map(document => ({
          ...document,
          attachments: document.attachments.map(attachment => {
            const replacement = replacements.get(attachment.id);
            if (!replacement) throw new Error(`Missing restored file: ${attachment.name}`);
            return replacement;
          }),
        })),
      });
      await this.commit(restored);
      committed = true;
    } catch (error) {
      if (!committed) {
        try {
          await this.cleanup(staged, 'Restore failed and staged-file cleanup was incomplete.');
        } catch (cleanupError) {
          throw new Error(`${message(error)} ${message(cleanupError)}`);
        }
      }
      throw error;
    }
    await this.cleanupAfterCommit(oldFiles, 'Backup restored, but old-file cleanup was incomplete.');
    return true;
  });
}
