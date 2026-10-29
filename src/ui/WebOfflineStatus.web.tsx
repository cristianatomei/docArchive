import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useArchive } from '../state/ArchiveProvider';

export default function WebOfflineStatus() {
  const { archive } = useArchive();
  const [error, setError] = useState('');
  const unsupported = process.env.NODE_ENV === 'production' &&
    typeof navigator !== 'undefined' && !('serviceWorker' in navigator);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/service-worker.js').catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, []);
  if (!error && !unsupported) return null;
  const label = archive.settings.language === 'ro'
    ? 'Reîncărcarea offline nu este disponibilă în acest browser'
    : 'Offline reload is unavailable in this browser';
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: '#FFF0D6', padding: 10 }}>
      <Text style={{ color: '#794C08' }}>{label}: {error || 'HTTPS / localhost + service worker'}</Text>
    </View>
  );
}
