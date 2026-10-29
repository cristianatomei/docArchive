import { Text, View } from 'react-native';
import type { Language } from '../core/types';
import { getCopy } from '../i18n';
import { useArchive } from '../state/ArchiveProvider';
import { Button, Chip, PrivacyNotice } from './components';
import { styles as s } from './theme';

export default function SettingsPanel({ busy, onLanguage, onExport, onImport }: {
  busy: boolean; onLanguage(language: Language): void; onExport(): void; onImport(): void;
}) {
  const { archive } = useArchive();
  const t = getCopy(archive.settings.language);
  return (
    <View style={s.stack}>
      <View style={{ marginBottom: 8 }}>
        <Text accessibilityRole="header" style={s.pageTitle}>{t.settings}</Text>
        <Text style={s.subtitle}>{t.settingsDescription}</Text>
      </View>
      <PrivacyNotice copy={t} />
      <View style={[s.card, s.stack]}>
        <Text style={s.sectionTitle}>{t.language}</Text>
        <Text style={s.hint}>{t.languageDescription}</Text>
        <View style={s.wrap}>
          <Chip selected={archive.settings.language === 'ro'} disabled={busy} onPress={() => onLanguage('ro')}>{t.romanian}</Chip>
          <Chip selected={archive.settings.language === 'en'} disabled={busy} onPress={() => onLanguage('en')}>{t.english}</Chip>
        </View>
      </View>
      <View style={[s.card, s.stack]}>
        <Text style={s.sectionTitle}>{t.backup}</Text>
        <Text style={s.detailValue}>{t.backupDescription}</Text>
        <View style={s.notice}><Text style={s.noticeText}>{t.backupWarning}</Text></View>
        <Text style={s.hint}>{t.attachmentLimit}</Text>
        <View style={s.wrap}>
          <Button onPress={onExport} disabled={busy}>{t.exportBackup}</Button>
          <Button variant="secondary" onPress={onImport} disabled={busy}>{t.importBackup}</Button>
        </View>
      </View>
      <View style={[s.card, s.stack]}>
        <Text style={s.sectionTitle}>{t.localTitle}</Text>
        <Text style={s.hint}>{t.localDescription}</Text>
        <View style={s.row}><View style={s.offlineDot} /><Text style={s.offline}>{t.offline}</Text></View>
      </View>
    </View>
  );
}
