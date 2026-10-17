import { apiClient } from './client';
import { parseApiError } from './error-handler';

// Exchanges the admin password once for a signed, expiring token. Only the
// token is ever stored on the device; the password is never persisted.
export async function loginWithPassword(password: string): Promise<string> {
  try {
    const { data } = await apiClient.post<{ token?: string }>('/api/auth', { password, client: 'mobile' });
    if (!data?.token) throw new Error('Login failed. Please try again.');
    return data.token;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
