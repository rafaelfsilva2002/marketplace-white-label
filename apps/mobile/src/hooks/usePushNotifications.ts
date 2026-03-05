import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

type NotificationData = Record<string, unknown>;

interface UsePushNotificationsResult {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  error: string | null;
  requestPermissions: () => Promise<boolean>;
}

async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  // For Android, set up the notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: undefined, // Uses the projectId from app.json automatically
  });

  return tokenData.data;
}

function getPlatform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

export function usePushNotifications(
  onNotificationTap?: (data: NotificationData) => void,
): UsePushNotificationsResult {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  const registerTokenWithApi = useCallback(async (token: string) => {
    try {
      await api('/notifications/push-token', {
        method: 'POST',
        body: { token, platform: getPlatform() },
      });
    } catch (err) {
      console.warn('Failed to register push token with API:', err);
    }
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const token = await getExpoPushToken();
      if (token) {
        setExpoPushToken(token);
        if (isAuthenticated) {
          await registerTokenWithApi(token);
        }
        return true;
      }
      setError('Notification permissions not granted');
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get push token';
      setError(message);
      return false;
    }
  }, [isAuthenticated, registerTokenWithApi]);

  // Register token when user authenticates
  useEffect(() => {
    if (!isAuthenticated) return;

    (async () => {
      try {
        const token = await getExpoPushToken();
        if (token) {
          setExpoPushToken(token);
          await registerTokenWithApi(token);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get push token';
        setError(message);
      }
    })();
  }, [isAuthenticated, registerTokenWithApi]);

  // Listen for incoming notifications
  useEffect(() => {
    // Foreground notification
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notif) => {
        setNotification(notif);
      },
    );

    // User tapped on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as NotificationData;
        onNotificationTap?.(data);
      },
    );

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [onNotificationTap]);

  return {
    expoPushToken,
    notification,
    error,
    requestPermissions,
  };
}
