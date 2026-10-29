import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { searchDocuments } from '../core/archive';
import type { ArchiveDocument, Attachment, DocumentStatus, Language } from '../core/types';
import { getCopy } from '../i18n';
import { pickDocumentAttachments, removeStoredAttachment } from '../services/documents';
import { useArchive } from '../state/ArchiveProvider';
import { Button, Chip, Dialog, EmptyState, Field, Message, PrivacyNotice, errorMessage } from './components';
import DocumentEditor from './DocumentEditor';
import { DocumentCard, DocumentDetails } from './DocumentViews';
import SettingsPanel from './SettingsPanel';
import TaxonomyManager from './TaxonomyManager';
import { colors, styles as s } from './theme';
import { checkAttachmentLimits, UnsavedAttachments } from './attachmentLifecycle';

type Section = 'dashboard' | 'archive' | 'categories' | 'tags' | 'settings';
const NAV: { key: Section; glyph: string }[] = [
  { key: 'dashboard', glyph: '◫' },
  { key: 'archive', glyph: '▤' },
  { key: 'categories', glyph: '▦' },
  { key: 'tags', glyph: '#' },
  { key: 'settings', glyph: '⚙' },
];

type Confirmation = { kind: 'delete'; document: ArchiveDocument } | { kind: 'restore' };
type EditorState = { document?: ArchiveDocument; attachments?: Attachment[]; error?: string };

export default function ArchiveApp() {
  const context = useArchive();
  const { archive, loading, busy: archiveBusy, error: providerError, clearError } = context;
  const t = getCopy(archive.settings.language);
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const [section, setSection] = useState<Section>('dashboard');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [tagId, setTagId] = useState<string | undefined>();
  const [status, setStatus] = useState<DocumentStatus | undefined>();
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [localError, setLocalError] = useState('');
  const busy = working || archiveBusy;
  const selected = archive.documents.find(document => document.id === selectedId);
  const filtered = useMemo(
    () => searchDocuments(archive, query, { categoryId, tagId, status }),
    [archive, query, categoryId, tagId, status],
  );
  const recent = useMemo(
    () => [...archive.documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4),
    [archive.documents],
  );
  const activeFilters = Boolean(categoryId || tagId || status || query.trim());
  const pages = archive.documents.reduce((sum, document) => sum + document.attachments.length, 0);

  function resetFilters() {
    setQuery('');
    setCategoryId(undefined);
    setTagId(undefined);
    setStatus(undefined);
  }

  function navigate(next: Section) {
    setSection(next);
    setMessage('');
    setLocalError('');
  }

  function create() {
    setMessage('');
    setLocalError('');
    clearError();
    setEditor({});
  }

  async function importFiles() {
    setWorking(true);
    setLocalError('');
    setMessage('');
    clearError();
    try {
      const attachments = await pickDocumentAttachments();
      if (attachments.length > 0) {
        const unsaved = new UnsavedAttachments(attachments, archive.documents);
        try {
          checkAttachmentLimits(archive, attachments, t);
        } catch (reason) {
          const limitError = errorMessage(reason, t.errorFallback);
          try {
            await unsaved.cleanup(removeStoredAttachment);
          } catch (cleanupReason) {
            const error = `${limitError}\n${t.cleanupFailed} ${errorMessage(cleanupReason, t.errorFallback)}`;
            setEditor({ error, attachments: unsaved.pending() });
            return;
          }
          throw reason;
        }
        setEditor({ attachments });
      }
    } catch (reason) {
      setLocalError(errorMessage(reason, t.errorFallback));
    } finally { setWorking(false); }
  }

  async function perform(action: () => Promise<unknown>, success?: string) {
    setWorking(true);
    setLocalError('');
    setMessage('');
    clearError();
    try {
      await action();
      if (success) setMessage(success);
    } catch (reason) {
      setLocalError(errorMessage(reason, t.errorFallback));
    } finally { setWorking(false); }
  }

  async function confirmAction() {
    if (!confirmation) return;
    setWorking(true);
    setLocalError('');
    clearError();
    try {
      if (confirmation.kind === 'delete') {
        await context.deleteDocument(confirmation.document.id);
        setMessage(t.deleted);
      } else {
        const restored = await context.importBackup();
        if (restored) {
          resetFilters();
          setSelectedId(null);
          setMessage(getCopy(archive.settings.language).restored);
        }
      }
      setConfirmation(null);
    } catch (reason) {
      setLocalError(errorMessage(reason, t.errorFallback));
    } finally { setWorking(false); }
  }

  function saved(document: ArchiveDocument) {
    setEditor(null);
    setSelectedId(document.id);
    setMessage(t.saved);
    setSection('archive');
  }

  const error = localError || providerError;
  const navigation = (mobile = false) => NAV.map(item => (
    <Pressable
      key={item.key}
      accessibilityRole="tab"
      accessibilityLabel={t[item.key]}
      accessibilityState={{ selected: section === item.key }}
      onPress={() => navigate(item.key)}
      style={({ pressed }) => [
        mobile ? s.bottomTab : s.navItem,
        !mobile && section === item.key && s.navActive,
        pressed && s.pressed,
      ]}
    >
      <Text accessible={false} style={[mobile ? s.bottomIcon : s.navIcon, section === item.key && { color: colors.teal }]}>{item.glyph}</Text>
      <Text style={[mobile ? s.bottomLabel : s.navLabel, section === item.key && s.navLabelActive]}>{t[item.key]}</Text>
    </Pressable>
  ));

  if (loading) {
    return (
      <View style={[s.app, s.loading]}>
        <Brand />
        <ActivityIndicator size="large" color={colors.teal} />
        <Text style={s.subtitle}>{t.loading}</Text>
      </View>
    );
  }

  return (
    <View style={s.app}>
      <View style={s.workspace}>
        {wide && (
          <View style={s.sidebar}>
            <Brand />
            <Text style={s.brandCaption}>{t.brandCaption}</Text>
            <Text style={s.eyebrow}>{t.workspace}</Text>
            <View accessibilityLabel={t.menu} style={s.sidebarNav}>{navigation()}</View>
            <Button onPress={create} disabled={busy}>+ {t.newDocument}</Button>
            <View style={s.sidebarBottom}>
              <View style={s.row}><View style={s.offlineDot} /><Text style={s.offline}>{t.offline}</Text></View>
              <Text style={[s.hint, { marginTop: 10 }]}>{t.privacyTitle}</Text>
            </View>
          </View>
        )}
        <View style={s.main}>
          <View style={[s.header, wide && s.headerWide]}>
            {wide ? <Text style={s.headerSection}>{t[section]}</Text> : <Brand compact={width < 380} />}
            {wide ? (
              <View style={s.row}><View style={s.offlineDot} /><Text style={s.offline}>{t.offline}</Text></View>
            ) : (
              <Button onPress={create} disabled={busy} label={t.newDocument}>+ {width < 390 ? t.document : t.newDocument}</Button>
            )}
          </View>
          <View style={{ paddingHorizontal: wide ? 38 : 20, paddingVertical: 8, backgroundColor: colors.amberSoft, borderBottomWidth: 1, borderBottomColor: '#EDDBB7' }}>
            <Text style={[s.noticeTitle, { fontSize: 10 }]}>{t.privacyTitle}</Text>
          </View>
          <ScrollView
            key={section}
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[s.content, wide && s.contentWide]}
          >
            {error && !editor && !confirmation ? (
              <View style={s.stack}>
                <Message text={error} error />
                <View style={s.wrap}>
                  <Button variant="secondary" onPress={() => void perform(context.reload)} disabled={busy}>{t.retry}</Button>
                  <Button variant="quiet" onPress={() => { setLocalError(''); clearError(); }}>{t.dismiss}</Button>
                </View>
              </View>
            ) : null}
            {message ? <Message text={message} /> : null}
            {section === 'dashboard' && (
              <>
                <View>
                  <Text style={s.eyebrow}>{t.workspace}</Text>
                  <Text accessibilityRole="header" style={[s.heroTitle, !wide && { fontSize: 31, lineHeight: 39 }]}>{t.welcome}</Text>
                  <Text style={s.subtitle}>{t.welcomeDescription}</Text>
                </View>
                <View>
                  <Text style={[s.eyebrow, { marginBottom: 12 }]}>{t.overview.toLocaleUpperCase(archive.settings.language)}</Text>
                  <View style={s.stats}>
                    <Stat value={archive.documents.length} label={t.documentCount} caption={t.totalCaption} glyph="▤" />
                    <Stat value={archive.documents.filter(document => document.status === 'review').length} label={t.reviewCount} caption={t.reviewCaption} glyph="◷" />
                    <Stat value={pages} label={t.pageCount} caption={t.pagesCaption} glyph="▱" />
                  </View>
                </View>
                <View style={s.actionCard}>
                  <View><Text style={s.actionHeading}>{t.quickStart}</Text><Text style={s.subtitle}>{t.quickStartDescription}</Text></View>
                  <View style={s.wrap}>
                    <Button onPress={() => void importFiles()} disabled={busy} loading={working}>{t.importFiles}</Button>
                    <Button onPress={create} variant="secondary" disabled={busy}>{t.createRecord}</Button>
                  </View>
                </View>
                <View>
                  <View style={s.sectionHeader}>
                    <Text style={s.sectionTitle}>{t.recentDocuments}</Text>
                    <Button variant="quiet" onPress={() => navigate('archive')}>{t.seeAll} →</Button>
                  </View>
                  {recent.length === 0 ? (
                    <EmptyState title={t.emptyTitle} description={t.emptyDescription} action={t.newDocument} onAction={create} />
                  ) : <View style={s.stack}>{recent.map(document => <DocumentCard key={document.id} document={document} archive={archive} onPress={() => setSelectedId(document.id)} />)}</View>}
                </View>
                <PrivacyNotice copy={t} />
              </>
            )}
            {section === 'archive' && (
              <>
                <View style={s.sectionHeader}>
                  <View style={{ flex: 1 }}><Text accessibilityRole="header" style={s.pageTitle}>{t.archive}</Text><Text style={s.subtitle}>{t.archiveDescription}</Text></View>
                  {wide && <Button onPress={create} disabled={busy}>+ {t.newDocument}</Button>}
                </View>
                <View style={s.card}>
                  <Field label={t.search} placeholder={t.searchPlaceholder} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} returnKeyType="search" hint={t.searchHint} />
                  <View style={[s.wrap, { justifyContent: 'space-between' }]}>
                    <Button variant="secondary" onPress={() => setFiltersVisible(!filtersVisible)} label={`${t.filters}${activeFilters ? ` · ${t.filtersActive}` : ''}`}>{t.filters}{activeFilters ? ' •' : ''} {filtersVisible ? '−' : '+'}</Button>
                    {activeFilters && <Button variant="quiet" onPress={resetFilters}>{t.clearFilters}</Button>}
                  </View>
                  {filtersVisible && (
                    <View style={[s.stack, { marginTop: 22 }]}>
                      <FilterGroup label={t.category}>
                        <Chip selected={!categoryId} onPress={() => setCategoryId(undefined)}>{t.allCategories}</Chip>
                        {archive.categories.map(category => <Chip key={category.id} selected={categoryId === category.id} onPress={() => setCategoryId(category.id)}>{category.name}</Chip>)}
                      </FilterGroup>
                      <FilterGroup label={t.tag}>
                        <Chip selected={!tagId} onPress={() => setTagId(undefined)}>{t.allTags}</Chip>
                        {archive.tags.map(tag => <Chip key={tag.id} selected={tagId === tag.id} onPress={() => setTagId(tag.id)}>{tag.name}</Chip>)}
                      </FilterGroup>
                      <FilterGroup label={t.status}>
                        <Chip selected={!status} onPress={() => setStatus(undefined)}>{t.allStatuses}</Chip>
                        {(['draft', 'review', 'archived'] as DocumentStatus[]).map(value => <Chip key={value} selected={status === value} onPress={() => setStatus(value)}>{t[value]}</Chip>)}
                      </FilterGroup>
                    </View>
                  )}
                </View>
                <Text accessibilityLiveRegion="polite" style={s.hint}>{filtered.length} {t.results}</Text>
                {filtered.length === 0 ? (
                  <EmptyState
                    title={activeFilters ? t.noResults : t.emptyTitle}
                    description={activeFilters ? t.noResultsDescription : t.emptyDescription}
                    action={activeFilters ? t.clearFilters : t.newDocument}
                    onAction={activeFilters ? resetFilters : create}
                    glyph={activeFilters ? '⌕' : '▤'}
                  />
                ) : <View style={s.stack}>{filtered.map(document => <DocumentCard key={document.id} document={document} archive={archive} onPress={() => setSelectedId(document.id)} />)}</View>}
              </>
            )}
            {(section === 'categories' || section === 'tags') && <TaxonomyManager key={section} kind={section} />}
            {section === 'settings' && (
              <SettingsPanel
                busy={busy}
                onLanguage={(language: Language) => { setMessage(''); void perform(() => context.setLanguage(language)); }}
                onExport={() => void perform(context.exportBackup, t.exported)}
                onImport={() => { setLocalError(''); clearError(); setConfirmation({ kind: 'restore' }); }}
              />
            )}
          </ScrollView>
        </View>
      </View>
      {!wide && <View accessibilityLabel={t.menu} style={s.bottomTabs}>{navigation(true)}</View>}
      {editor && (
        <DocumentEditor
          document={editor.document} initialAttachments={editor.attachments} initialError={editor.error}
          onClose={() => setEditor(null)} onSaved={saved}
        />
      )}
      {selected && !editor && !confirmation && (
        <DocumentDetails
          document={selected} archive={archive} onClose={() => setSelectedId(null)}
          onEdit={() => { setEditor({ document: selected }); setSelectedId(null); clearError(); }}
          onDelete={() => { setLocalError(''); clearError(); setConfirmation({ kind: 'delete', document: selected }); setSelectedId(null); }}
        />
      )}
      {confirmation && (
        <Dialog
          compact title={confirmation.kind === 'delete' ? t.documentDeleteTitle : t.restoreTitle}
          copy={t} busy={busy} onClose={() => { setConfirmation(null); setLocalError(''); }}
          footer={<><Button variant="secondary" onPress={() => { setConfirmation(null); setLocalError(''); }} disabled={busy}>{t.cancel}</Button><Button variant="danger" onPress={() => void confirmAction()} disabled={busy} loading={working}>{confirmation.kind === 'delete' ? t.delete : t.restoreConfirm}</Button></>}
        >
          <View style={s.stack}>
            {confirmation.kind === 'delete' && <Text style={s.documentTitle}>{confirmation.document.title}</Text>}
            <Text style={s.detailValue}>{confirmation.kind === 'delete' ? t.documentDeleteBody : t.restoreBody}</Text>
            {confirmation.kind === 'restore' && <PrivacyNotice copy={t} />}
            {error ? <Message text={error} error /> : null}
          </View>
        </Dialog>
      )}
    </View>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <View style={s.brand}><View style={[s.brandMark, compact && { width: 29, height: 33 }]}><Text accessible={false} style={s.brandMarkText}>≡</Text></View><Text style={[s.brandName, compact && { fontSize: 20 }]}>docArchive</Text></View>;
}

function Stat({ value, label, caption, glyph }: { value: number; label: string; caption: string; glyph: string }) {
  return (
    <View style={s.stat}>
      <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.statLabel}>{label}</Text><Text style={s.statIcon} accessible={false}>{glyph}</Text></View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statCaption}>{caption}</Text>
    </View>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ gap: 9 }}><Text style={s.fieldLabel}>{label}</Text><View style={s.wrap}>{children}</View></View>;
}
