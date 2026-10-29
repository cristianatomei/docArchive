import type { ArchiveData, ArchiveDocument, DocumentInput, Language } from '../core/types';

export interface ArchiveContextValue {
  archive: ArchiveData;
  loading: boolean;
  busy: boolean;
  error: string | null;
  clearError(): void;
  reload(): Promise<void>;
  saveDocument(input: DocumentInput, id?: string): Promise<ArchiveDocument>;
  deleteDocument(id: string): Promise<void>;
  saveCategory(name: string, id?: string): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  saveTag(name: string, id?: string): Promise<void>;
  deleteTag(id: string): Promise<void>;
  setLanguage(language: Language): Promise<void>;
  exportBackup(): Promise<void>;
  importBackup(): Promise<boolean>;
}
