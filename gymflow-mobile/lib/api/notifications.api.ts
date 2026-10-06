import { apiClient } from './client';
import { parseApiError } from './error-handler';

export type AdminNotification = {
  id: string;
  type: 'ticket' | 'feedback' | 'payment_request' | 'new_gym' | 'email';
  gym_id: string | null;
  title: string;
  body: string;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
};

export type NotificationsResponse = {
  notifications: AdminNotification[];
  unread: number;
};

export async function fetchNotifications(): Promise<NotificationsResponse> {
  try {
    const { data } = await apiClient.get<NotificationsResponse>('/api/notifications');
    return data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await apiClient.patch('/api/notifications', { id });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  try {
    await apiClient.patch('/api/notifications', { all: true });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

/** Registers this device's FCM token with the backend so it receives push. */
export async function registerPushToken(token: string, platform: 'android' | 'ios'): Promise<void> {
  try {
    await apiClient.post('/api/push/register-token', { token, platform });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

/**
 * Removes this device's token on sign-out, so a signed-out phone stops receiving
 * admin alerts. Must be called while the auth token is still present.
 */
export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await apiClient.delete('/api/push/register-token', { data: { token } });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
