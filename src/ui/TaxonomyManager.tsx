import { useState } from 'react';
import { Text, View } from 'react-native';
import type { TaxonomyItem } from '../core/types';
import { getCopy } from '../i18n';
import { useArchive } from '../state/ArchiveProvider';
import { Button, Dialog, EmptyState, Field, Message, errorMessage } from './components';
import { styles as s } from './theme';

export default function TaxonomyManager({ kind }: { kind: 'categories' | 'tags' }) {
  const { archive, busy, saveCategory, deleteCategory, saveTag, deleteTag } = useArchive();
  const t = getCopy(archive.settings.language);
  const categories = kind === 'categories';
  const items = archive[kind];
  const [editing, setEditing] = useState<{ item?: TaxonomyItem; name: string } | null>(null);
  const [deleting, setDeleting] = useState<TaxonomyItem | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const blocked = working || busy;

  function start(item?: TaxonomyItem) {
    setError('');
    setEditing({ item, name: item?.name ?? '' });
  }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) { setError(t.nameRequired); return; }
    setWorking(true);
    setError('');
    try {
      await (categories ? saveCategory : saveTag)(editing.name.trim(), editing.item?.id);
      setEditing(null);
    } catch (reason) {
      setError(errorMessage(reason, t.errorFallback));
    } finally { setWorking(false); }
  }

  async function remove() {
    if (!deleting) return;
    setWorking(true);
    setError('');
    try {
      await (categories ? deleteCategory : deleteTag)(deleting.id);
      setDeleting(null);
    } catch (reason) {
      // Keep the provider's precise in-use error visible instead of silently unlinking documents.
      setError(errorMessage(reason, t.errorFallback));
    } finally { setWorking(false); }
  }

  return (
    <>
      <View style={s.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={s.pageTitle}>{t[kind]}</Text>
          <Text style={s.subtitle}>{categories ? t.taxonomyCategoriesDescription : t.taxonomyTagsDescription}</Text>
        </View>
        <Button onPress={() => start()} disabled={blocked}>{categories ? t.newCategory : t.newTag}</Button>
      </View>
      {items.length === 0 ? (
        <EmptyState
          glyph={categories ? '▦' : '#'}
          title={categories ? t.taxonomyEmptyCategories : t.taxonomyEmptyTags}
          description={t.taxonomyEmptyDescription}
          action={categories ? t.newCategory : t.newTag}
          onAction={() => start()}
        />
      ) : (
        <View style={[s.wrap, { alignItems: 'stretch' }]}>
          {items.map(item => {
            const count = archive.documents.filter(document => categories ? document.categoryId === item.id : document.tagIds.includes(item.id)).length;
            return (
              <View key={item.id} style={s.taxonomyCard}>
                <View style={s.row}>
                  <View style={[s.taxonomyDot, { backgroundColor: /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : undefined }]} />
                  <Text style={[s.documentTitle, { flex: 1 }]}>{item.name}</Text>
                </View>
                <Text style={s.hint}>{count} {t.documentUsage}</Text>
                <View style={s.wrap}>
                  <Button variant="secondary" onPress={() => start(item)} disabled={blocked} label={`${t.rename}: ${item.name}`}>{t.rename}</Button>
                  <Button variant="quiet" onPress={() => { setError(''); setDeleting(item); }} disabled={blocked} label={`${t.delete}: ${item.name}`}>{t.delete}</Button>
                </View>
              </View>
            );
          })}
        </View>
      )}
      {editing && (
        <Dialog
          compact title={editing.item ? (categories ? t.renameCategory : t.renameTag) : (categories ? t.newCategory : t.newTag)}
          copy={t} busy={blocked} onClose={() => setEditing(null)}
          footer={<><Button variant="secondary" onPress={() => setEditing(null)} disabled={blocked}>{t.cancel}</Button><Button onPress={() => void save()} disabled={blocked} loading={working}>{t.saveName}</Button></>}
        >
          <Field label={t.name} value={editing.name} onChangeText={name => setEditing({ ...editing, name })} editable={!blocked} maxLength={100} onSubmitEditing={() => void save()} returnKeyType="done" />
          {error ? <Message error text={error} /> : null}
        </Dialog>
      )}
      {deleting && (
        <Dialog
          compact title={t.taxonomyDeleteTitle} copy={t} busy={blocked} onClose={() => setDeleting(null)}
          footer={<><Button variant="secondary" onPress={() => setDeleting(null)} disabled={blocked}>{t.cancel}</Button><Button variant="danger" onPress={() => void remove()} disabled={blocked} loading={working}>{t.delete}</Button></>}
        >
          <View style={s.stack}>
            <Text style={s.documentTitle}>{deleting.name}</Text>
            <Text style={s.detailValue}>{t.taxonomyDeleteBody}</Text>
            {error ? <Message error text={error} /> : null}
          </View>
        </Dialog>
      )}
    </>
  );
}
