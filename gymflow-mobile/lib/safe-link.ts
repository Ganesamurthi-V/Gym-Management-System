import { Alert, Linking } from 'react-native';

/**
 * Opens a server-supplied URL only if it is https. A compromised or malformed
 * API value (intent:, file:, javascript:, http:) must never reach the OS.
 */
export async function openHttpsUrl(url: unknown): Promise<void> {
  if (typeof url !== 'string' || !/^https:\/\/\S+$/i.test(url)) {
    Alert.alert('Cannot open link', 'This link is not a secure web address.');
    return;
  }
  await Linking.openURL(url);
}
