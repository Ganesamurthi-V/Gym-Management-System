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

    // Network errors, timeouts, etc.
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
