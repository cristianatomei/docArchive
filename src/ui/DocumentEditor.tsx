import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { ArchiveDocument, Attachment, DocumentInput, DocumentStatus } from '../core/types';
import { getCopy, formatBytes } from '../i18n';
import {
  captureDocumentPhoto,
  extractAttachmentText,
  ocrSupported,
  openAttachment,
  pickDocumentAttachments,
  removeStoredAttachment,
} from '../services/documents';
import { useArchive } from '../state/ArchiveProvider';
import { Button, Chip, Dialog, Field, errorMessage } from './components';
import { styles as s } from './theme';
import { appendOcrResult, checkAttachmentLimits, UnsavedAttachments } from './attachmentLifecycle';

const EMPTY_INPUT: DocumentInput = {
  title: '',
  categoryId: null,
  tagIds: [],
  schoolYear: '',
  className: '',
  studentName: '',
  reference: '',
  physicalLocation: '',
  notes: '',
  ocrText: '',
  status: 'draft',
  attachments: [],
};

export default function DocumentEditor({ document, initialAttachments = [], initialError, onClose, onSaved }: {
  document?: ArchiveDocument;
  initialAttachments?: Attachment[];
  initialError?: string;
  onClose(): void;
  onSaved(document: ArchiveDocument): void;
}) {
  const { archive, busy: archiveBusy, saveDocument } = useArchive();
  const t = getCopy(archive.settings.language);
  const [initial, setInitial] = useState<DocumentInput>(() => document ? { ...document } : { ...EMPTY_INPUT, attachments: initialAttachments });
  const [form, setForm] = useState<DocumentInput>(() => document ? { ...document } : { ...EMPTY_INPUT, attachments: initialAttachments });
  const savedId = useRef(document?.id);
  const [unsaved] = useState(() => new UnsavedAttachments(document ? [] : initialAttachments, archive.documents));
  const [operation, setOperation] = useState<string | null>(null);
  const [error, setError] = useState(initialError ?? '');
  const [notice, setNotice] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const busy = operation !== null || archiveBusy;
  const supportsOcr = ocrSupported();

  function update<K extends keyof DocumentInput>(key: K, value: DocumentInput[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
    setNotice('');
  }

  function close() {
    if (busy) return;
    if (unsaved.size || JSON.stringify(form) !== JSON.stringify(initial)) setConfirmDiscard(true);
    else onClose();
  }

  async function discard() {
    setOperation('cleanup');
    setError('');
    try {
      unsaved.markSaved(archive.documents.flatMap(item => item.attachments));
      await unsaved.cleanup(removeStoredAttachment);
      onClose();
    } catch (reason) {
      setError(`${t.cleanupFailed} ${errorMessage(reason, t.errorFallback)}`);
    } finally { setOperation(null); }
  }

  async function removeAttachment(attachment: Attachment) {
    setOperation('cleanup');
    setError('');
    try {
      unsaved.markSaved(archive.documents.flatMap(item => item.attachments));
      await unsaved.remove(attachment, removeStoredAttachment);
      update('attachments', form.attachments.filter(item => item.id !== attachment.id));
    } catch (reason) {
      setError(`${t.cleanupFailed} ${errorMessage(reason, t.errorFallback)}`);
    } finally { setOperation(null); }
  }

  async function addAttachments(camera: boolean) {
    setOperation(camera ? 'camera' : 'files');
    setError('');
    setNotice('');
    try {
      const additions = camera
        ? await captureDocumentPhoto().then(file => file ? [file] : [])
        : await pickDocumentAttachments();
      unsaved.markSaved(archive.documents.flatMap(item => item.attachments));
      unsaved.track(additions);
      const combined = [...form.attachments, ...additions];
      checkAttachmentLimits(archive, combined, t, savedId.current);
      update('attachments', combined);
    } catch (reason) {
      let message = errorMessage(reason, t.errorFallback);
      try {
        await unsaved.cleanup(removeStoredAttachment, form.attachments);
      } catch (cleanupReason) {
        message += `\n${t.cleanupFailed} ${errorMessage(cleanupReason, t.errorFallback)}`;
      }
      setError(message);
    } finally {
      setOperation(null);
    }
  }

  async function save() {
    if (!form.title.trim()) {
      setError(t.titleRequired);
      return;
    }
    setOperation('save');
    setError('');
    try {
      checkAttachmentLimits(archive, form.attachments, t, savedId.current);
      await unsaved.cleanup(removeStoredAttachment, form.attachments).catch(reason => {
        throw new Error(`${t.cleanupFailed} ${errorMessage(reason, t.errorFallback)}`);
      });
      const saved = await saveDocument({ ...form, title: form.title.trim() }, savedId.current);
      savedId.current = saved.id;
      unsaved.markSaved(saved.attachments);
      onSaved(saved);
    } catch (reason) {
      setError(errorMessage(reason, t.saveFailed));
    } finally {
      setOperation(null);
    }
  }

  async function runOcr(attachment: Attachment) {
    if (!form.title.trim()) {
      setError(t.titleRequired);
      return;
    }
    setOperation(attachment.id);
    setError('');
    setNotice('');
    let draftSaved = false;
    try {
      checkAttachmentLimits(archive, form.attachments, t, savedId.current);
      await unsaved.cleanup(removeStoredAttachment, form.attachments).catch(reason => {
        throw new Error(`${t.cleanupFailed} ${errorMessage(reason, t.errorFallback)}`);
      });
      const draftInput = { ...form, title: form.title.trim(), status: 'draft' as const };
      const draft = await saveDocument(draftInput, savedId.current);
      savedId.current = draft.id;
      unsaved.markSaved(draft.attachments);
      setInitial(draftInput);
      setForm(draftInput);
      draftSaved = true;
      const text = (await extractAttachmentText(attachment)).trim();
      if (!text) {
        setNotice(t.ocrEmpty);
        return;
      }
      // OCR is additive: never replace an existing transcription or manual text.
      const next = appendOcrResult(draftInput, text);
      setForm(next);
      const reviewed = await saveDocument(next, savedId.current);
      unsaved.markSaved(reviewed.attachments);
      setInitial(next);
      setNotice(t.ocrSaved);
    } catch (reason) {
      if (draftSaved) setForm(previous => ({ ...previous, status: 'draft' }));
      setError(`${draftSaved ? t.ocrFailed : t.saveFailed} ${errorMessage(reason, t.errorFallback)}`);
    } finally {
      setOperation(null);
    }
  }

  async function viewFile(attachment: Attachment) {
    setOperation('view');
    setError('');
    try {
      await openAttachment(attachment);
    } catch (reason) {
      setError(errorMessage(reason, t.errorFallback));
    } finally {
      setOperation(null);
    }
  }

  return (
    <>
      <Dialog
        title={confirmDiscard ? t.discardTitle : document ? t.editDocument : t.newDocument}
        copy={t}
        onClose={confirmDiscard ? () => setConfirmDiscard(false) : close}
        busy={busy}
        message={(error || (!confirmDiscard && notice)) ? { text: error || notice, error: Boolean(error) } : undefined}
        footer={
          confirmDiscard ? <>
            <Button variant="secondary" onPress={() => setConfirmDiscard(false)} disabled={busy}>{t.cancel}</Button>
            <Button variant="danger" onPress={() => void discard()} disabled={busy} loading={operation === 'cleanup'}>{t.discard}</Button>
          </> : <>
            <Button variant="secondary" onPress={close} disabled={busy}>{t.cancel}</Button>
            <Button onPress={() => void save()} disabled={busy} loading={operation === 'save'}>{operation === 'save' ? t.saving : t.save}</Button>
          </>
        }
      >
        {confirmDiscard ? <Text style={s.detailValue}>{t.discardBody}</Text> : <>
        <Text style={[s.hint, { marginBottom: 20 }]}>{t.documentSubtitle}</Text>
        <Field label={`${t.title} · ${t.required}`} placeholder={t.titlePlaceholder} value={form.title} onChangeText={value => update('title', value)} editable={!busy} maxLength={200} />
        <View style={s.formSection}>
          <Text style={s.fieldLabel}>{t.status}</Text>
          <View style={s.wrap}>
            {(['draft', 'review', 'archived'] as DocumentStatus[]).map(status => (
              <Chip key={status} selected={form.status === status} onPress={() => update('status', status)} disabled={busy}>{t[status]}</Chip>
            ))}
          </View>
        </View>
        <View style={s.formSection}>
          <Text style={s.fieldLabel}>{t.category}</Text>
          <View style={s.wrap}>
            <Chip selected={form.categoryId === null} onPress={() => update('categoryId', null)} disabled={busy}>{t.uncategorized}</Chip>
            {archive.categories.map(category => (
              <Chip key={category.id} selected={form.categoryId === category.id} onPress={() => update('categoryId', category.id)} disabled={busy}>{category.name}</Chip>
            ))}
          </View>
        </View>
        <View style={s.formSection}>
          <Text style={s.fieldLabel}>{t.tags}</Text>
          {archive.tags.length === 0 ? <Text style={s.hint}>{t.noTags}</Text> : (
            <View style={s.wrap}>
              {archive.tags.map(tag => (
                <Chip
                  key={tag.id}
                  selected={form.tagIds.includes(tag.id)}
                  disabled={busy}
                  onPress={() => update('tagIds', form.tagIds.includes(tag.id) ? form.tagIds.filter(id => id !== tag.id) : [...form.tagIds, tag.id])}
                >{tag.name}</Chip>
              ))}
            </View>
          )}
        </View>
        <View style={s.divider} />
        <Text style={[s.sectionTitle, { marginTop: 10, marginBottom: 20 }]}>{t.metadata}</Text>
        <View style={s.formGrid}>
          <View style={s.formHalf}><Field label={t.schoolYear} placeholder={t.schoolYearPlaceholder} value={form.schoolYear} onChangeText={value => update('schoolYear', value)} editable={!busy} maxLength={100} /></View>
          <View style={s.formHalf}><Field label={t.className} placeholder={t.classPlaceholder} value={form.className} onChangeText={value => update('className', value)} editable={!busy} maxLength={100} /></View>
          <View style={s.formHalf}><Field label={t.studentName} placeholder={t.studentPlaceholder} value={form.studentName} onChangeText={value => update('studentName', value)} editable={!busy} maxLength={200} /></View>
          <View style={s.formHalf}><Field label={t.reference} placeholder={t.referencePlaceholder} value={form.reference} onChangeText={value => update('reference', value)} editable={!busy} maxLength={250} /></View>
        </View>
        <Field label={t.physicalLocation} placeholder={t.locationPlaceholder} value={form.physicalLocation} onChangeText={value => update('physicalLocation', value)} editable={!busy} maxLength={500} />
        <Field label={t.notes} placeholder={t.notesPlaceholder} multiline value={form.notes} onChangeText={value => update('notes', value)} editable={!busy} maxLength={100000} />
        <View style={s.divider} />
        <View style={[s.formSection, { marginTop: 15 }]}>
          <Text style={s.sectionTitle}>{t.attachments}</Text>
          <Text style={s.hint}>{t.attachmentDescription} {t.attachmentLimit}</Text>
          <View style={s.wrap}>
            <Button variant="secondary" onPress={() => void addAttachments(false)} disabled={busy} loading={operation === 'files'}>{t.addFiles}</Button>
            <Button variant="secondary" onPress={() => void addAttachments(true)} disabled={busy} loading={operation === 'camera'}>{t.takePhoto}</Button>
          </View>
          {form.attachments.length === 0 ? <Text style={s.hint}>{t.noAttachments}</Text> : form.attachments.map((file, index) => (
            <View key={file.id} style={s.attachment}>
              <View style={s.row}>
                <View style={s.fileIcon}><Text style={s.fileIconText}>{String(index + 1).padStart(2, '0')}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.documentTitle} numberOfLines={2}>{file.name}</Text>
                  <Text style={s.documentMeta}>{formatBytes(file.size)} · {file.mimeType}</Text>
                </View>
              </View>
              <View style={s.wrap}>
                <Button variant="quiet" onPress={() => void viewFile(file)} disabled={busy} label={`${t.openFile}: ${file.name}`}>{t.openFile}</Button>
                {file.mimeType.startsWith('image/') && (
                  <Button variant="secondary" onPress={() => void runOcr(file)} disabled={busy || !supportsOcr} loading={operation === file.id} label={`${t.extractText}: ${file.name}`}>{t.extractText}</Button>
                )}
                <Button variant="quiet" onPress={() => void removeAttachment(file)} disabled={busy} label={`${t.removeFile}: ${file.name}`}>{t.removeFile}</Button>
              </View>
            </View>
          ))}
          <Text style={s.hint}>{t.ocrExplanation}</Text>
          <Text style={s.hint}>{t.ocrSaveNotice}</Text>
        </View>
        <Field label={t.extractedText} placeholder={t.ocrPlaceholder} multiline value={form.ocrText} onChangeText={value => update('ocrText', value)} editable={!busy} style={{ minHeight: 160 }} maxLength={1000000} />
        {operation && operation !== 'save' ? <Text accessibilityLiveRegion="polite" style={s.hint}>{t.working}</Text> : null}
        </>}
      </Dialog>
    </>
  );
}
