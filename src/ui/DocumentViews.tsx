import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ArchiveData, ArchiveDocument } from '../core/types';
import { formatBytes, formatDate, getCopy } from '../i18n';
import { openAttachment } from '../services/documents';
import { Button, Dialog, StatusBadge, errorMessage } from './components';
import { colors, styles as s } from './theme';

export function DocumentCard({ document, archive, onPress }: {
  document: ArchiveDocument; archive: ArchiveData; onPress(): void;
}) {
  const t = getCopy(archive.settings.language);
  const category = archive.categories.find(item => item.id === document.categoryId);
  const tags = archive.tags.filter(item => document.tagIds.includes(item.id));
  const fileLabel = document.attachments[0]?.mimeType === 'application/pdf' ? 'PDF' : 'DOC';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${document.title}, ${category?.name ?? t.uncategorized}, ${t[document.status]}`}
      onPress={onPress}
      style={({ pressed }) => [s.documentCard, pressed && s.cardPressed]}
    >
      <View style={[s.row, { alignItems: 'flex-start' }]}>
        <View style={s.fileIcon}><Text style={s.fileIconText}>{fileLabel}</Text></View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={s.documentTitle} numberOfLines={2}>{document.title}</Text>
          <Text style={s.documentMeta}>{category?.name ?? t.uncategorized}</Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 24 }} accessible={false}>›</Text>
      </View>
      <View style={[s.wrap, { justifyContent: 'space-between', gap: 7 }]}>
        <View style={s.wrap}>
          <StatusBadge status={document.status} copy={t} />
          {tags.slice(0, 2).map(tag => <Text style={s.documentMeta} key={tag.id}>#{tag.name}</Text>)}
          {tags.length > 2 && <Text style={s.documentMeta}>+{tags.length - 2}</Text>}
        </View>
        <Text style={s.documentMeta}>{document.attachments.length} {t.pageCount.toLocaleLowerCase(archive.settings.language)} · {formatDate(document.updatedAt, archive.settings.language)}</Text>
      </View>
    </Pressable>
  );
}

export function DocumentDetails({ document, archive, onClose, onEdit, onDelete }: {
  document: ArchiveDocument; archive: ArchiveData; onClose(): void; onEdit(): void; onDelete(): void;
}) {
  const t = getCopy(archive.settings.language);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');
  const category = archive.categories.find(item => item.id === document.categoryId);
  const tags = archive.tags.filter(item => document.tagIds.includes(item.id));
  const fields: [string, string][] = [
    [t.schoolYear, document.schoolYear],
    [t.className, document.className],
    [t.studentName, document.studentName],
    [t.reference, document.reference],
    [t.physicalLocation, document.physicalLocation],
    [t.created, formatDate(document.createdAt, archive.settings.language)],
    [t.updated, formatDate(document.updatedAt, archive.settings.language)],
  ];

  async function open(id: string) {
    const file = document.attachments.find(item => item.id === id);
    if (!file) return;
    setOpening(id);
    setError('');
    try { await openAttachment(file); }
    catch (reason) { setError(errorMessage(reason, t.errorFallback)); }
    finally { setOpening(null); }
  }

  return (
    <Dialog
      title={t.documentDetails} copy={t} onClose={onClose} busy={opening !== null}
      message={error ? { text: error, error: true } : undefined}
      footer={<><Button variant="quiet" onPress={onDelete} disabled={opening !== null}>{t.delete}</Button><Button onPress={onEdit} disabled={opening !== null}>{t.edit}</Button></>}
    >
      <View style={[s.stack, { marginBottom: 24 }]}>
        <StatusBadge status={document.status} copy={t} />
        <Text accessibilityRole="header" selectable style={s.pageTitle}>{document.title}</Text>
        <Text style={s.subtitle}>{category?.name ?? t.uncategorized}</Text>
        {tags.length > 0 && <View style={s.wrap}>{tags.map(tag => <View key={tag.id} style={s.badge}><Text style={s.badgeText}>#{tag.name}</Text></View>)}</View>}
      </View>
      <View style={s.formGrid}>
        {fields.map(([label, value]) => (
          <View key={label} style={s.detailField}>
            <Text style={s.detailLabel}>{label}</Text>
            <Text selectable style={[s.detailValue, !value && { color: colors.muted }]}>{value || t.emptyValue}</Text>
          </View>
        ))}
      </View>
      {document.notes ? <View style={{ marginBottom: 24 }}><Text style={s.detailLabel}>{t.notes}</Text><Text selectable style={s.detailValue}>{document.notes}</Text></View> : null}
      <View style={[s.stack, { marginBottom: 25 }]}>
        <Text style={s.sectionTitle}>{t.attachments} · {document.attachments.length}</Text>
        {document.attachments.length === 0 ? <Text style={s.hint}>{t.noAttachments}</Text> : document.attachments.map((file, index) => (
          <View key={file.id} style={s.attachment}>
            <View style={s.row}>
              <View style={s.fileIcon}><Text style={s.fileIconText}>{String(index + 1).padStart(2, '0')}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.documentTitle}>{file.name}</Text>
                <Text style={s.documentMeta}>{formatBytes(file.size)}</Text>
              </View>
              <Button variant="secondary" disabled={opening !== null} loading={opening === file.id} label={`${t.openFile}: ${file.name}`} onPress={() => void open(file.id)}>{t.openFile}</Button>
            </View>
          </View>
        ))}
      </View>
      <View style={s.stack}>
        <Text style={s.sectionTitle}>{t.extractedText}</Text>
        <Text selectable style={[s.detailValue, { padding: 16, backgroundColor: colors.background, borderRadius: 10 }]}>{document.ocrText || t.emptyValue}</Text>
        <Text style={s.hint}>{t.ocrExplanation}</Text>
      </View>
    </Dialog>
  );
}
