import { Linking } from 'react-native';
import { toast } from '@/components/dashboard/Toast';

/**
 * Opens a server-supplied URL only if it is https. A compromised or malformed
 * API value (intent:, file:, javascript:, http:) must never reach the OS.
 */
export async function openHttpsUrl(url: unknown): Promise<void> {
  if (typeof url !== 'string' || !/^https:\/\/\S+$/i.test(url)) {
    toast.show('Cannot open link: this is not a secure web address.', 'error');
    return;
  }
  await Linking.openURL(url);
}
