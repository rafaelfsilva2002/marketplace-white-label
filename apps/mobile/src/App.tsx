import '../global.css';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AuthStack } from '@/navigation/AuthStack';
import { MainTabs } from '@/navigation/MainTabs';
import { AdminStack } from '@/navigation/AdminStack';
import { LoadingScreen } from '@/components/LoadingScreen';
import { linking } from '@/navigation/linking';
import { UserRole } from '@marketplace/shared';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
  },
});

function PushNotificationInitializer() {
  const handleNotificationTap = useCallback((data: Record<string, unknown>) => {
    // Navigate based on notification data type
    // The navigation will be handled via deep linking or
    // by reading the notification data and navigating accordingly
    console.log('Notification tapped:', data);
  }, []);

  usePushNotifications(handleNotificationTap);

  return null;
}

function RootNavigator() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <AuthStack />;
  if (user?.role === UserRole.Admin || user?.role === UserRole.Moderator) return <AdminStack />;
  return <MainTabs />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NavigationContainer linking={linking}>
            <PushNotificationInitializer />
            <RootNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
