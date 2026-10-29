export type Language = 'ro' | 'en';
export type DocumentStatus = 'draft' | 'review' | 'archived';

export interface TaxonomyItem {
  id: string;
  name: string;
  color: string;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uri: string;
}

export interface ArchiveDocument {
  id: string;
  title: string;
  categoryId: string | null;
  tagIds: string[];
  schoolYear: string;
  className: string;
  studentName: string;
  reference: string;
  physicalLocation: string;
  notes: string;
  ocrText: string;
  status: DocumentStatus;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export type DocumentInput = Omit<ArchiveDocument, 'id' | 'createdAt' | 'updatedAt'>;

export interface ArchiveData {
  version: 1;
  documents: ArchiveDocument[];
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
  settings: { language: Language };
}

export interface BackupAttachment {
  id: string;
  name: string;
  mimeType: string;
  base64: string;
}

export interface ArchiveBackup {
  format: 'docarchive-backup';
  version: 1;
  exportedAt: string;
  archive: ArchiveData;
  files: BackupAttachment[];
}
