import axios, { AxiosError } from 'axios';

/**
 * Standardized error parser to extract user-friendly error messages from API responses.
 * Ensures the UI always gets a clean string.
 */
export function parseApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; message?: string }>;

    // If the server provided a JSON response with an "error" or "message" field
    if (axiosError.response?.data) {
      if (axiosError.response.data.error) return axiosError.response.data.error;
      if (axiosError.response.data.message) return axiosError.response.data.message;
    }

    // A 401 without a body means the stored token is stale/invalid.
    if (axiosError.response?.status === 401) {
      return 'Your session has expired. Please sign in again.';
    }

    // Request timed out (server took longer than the configured timeout).
    if (axiosError.code === 'ECONNABORTED') {
      return 'The server took too long to respond. Check your connection and try again.';
    }

    // No response received at all — DNS failure, offline, or server unreachable.
    if (!axiosError.response) {
      return 'Unable to reach the server. Check your internet connection and try again.';
    }

    if (axiosError.message) {
      return axiosError.message;
    }
  }

  // Fallback for standard JS errors or unknown objects
  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred';
}
