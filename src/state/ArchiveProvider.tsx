import {
  createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore,
  type ReactNode,
} from 'react';
import * as documents from '../services/documents';
import * as storage from '../storage/archive';
import type { ArchiveContextValue } from './contracts';
import { ArchiveController } from './controller';

const ArchiveContext = createContext<ArchiveContextValue | null>(null);

export function ArchiveProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => new ArchiveController(storage, documents));
  const snapshot = useSyncExternalStore(
    controller.subscribe, controller.getSnapshot, controller.getSnapshot,
  );
  useEffect(() => {
    // The controller publishes load failures; no empty replacement is written.
    void controller.reload().catch(() => undefined);
  }, [controller]);
  const value = useMemo<ArchiveContextValue>(() => ({
    ...snapshot,
    clearError: controller.clearError,
    reload: controller.reload,
    saveDocument: controller.saveDocument,
    deleteDocument: controller.deleteDocument,
    saveCategory: (name, id) => controller.saveTaxonomy('categories', name, id),
    deleteCategory: id => controller.deleteTaxonomy('categories', id),
    saveTag: (name, id) => controller.saveTaxonomy('tags', name, id),
    deleteTag: id => controller.deleteTaxonomy('tags', id),
    setLanguage: controller.setLanguage,
    exportBackup: controller.exportBackup,
    importBackup: controller.importBackup,
  }), [controller, snapshot]);
  return <ArchiveContext.Provider value={value}>{children}</ArchiveContext.Provider>;
}

export function useArchive(): ArchiveContextValue {
  const value = useContext(ArchiveContext);
  if (!value) throw new Error('useArchive must be used inside ArchiveProvider.');
  return value;
}
