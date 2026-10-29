import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ArchiveProvider } from '../state/ArchiveProvider';
import WebOfflineStatus from '../ui/WebOfflineStatus';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
        <StatusBar style="dark" />
        <ArchiveProvider>
          <WebOfflineStatus />
          <Stack screenOptions={{ headerShown: false }} />
        </ArchiveProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
