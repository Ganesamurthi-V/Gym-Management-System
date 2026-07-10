import { apiClient } from './client';
import { parseApiError } from './error-handler';

export async function loginWithPassword(password: string): Promise<string> {
  try {
    // The previous implementation sent the password in the body.
    // The backend uses this to authenticate and return... what?
    // According to existing code, it returns a 200 on success, and we store the password itself as the bearer token.
    await apiClient.post('/api/auth', { password });

    return password;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
