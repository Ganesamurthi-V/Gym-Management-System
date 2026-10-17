import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'gymflow_admin_token';

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// Fired when the server rejects the stored token (expired, or revoked by an
// ADMIN_SESSION_VERSION bump) so the app can return to the login screen.
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: (() => void) | null): void {
  onSessionExpired = fn;
}
export async function expireSession(): Promise<void> {
  await clearToken();
  onSessionExpired?.();
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}
