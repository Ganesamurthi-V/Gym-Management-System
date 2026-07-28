import axios from 'axios';
import { getToken } from '../auth';

import { ADMIN_API_BASE as ENV_ADMIN_API_BASE } from '@env';

// Default to the production admin backend instead of localhost
const defaultBaseUrl = 'https://admin.gymflow.sbs';
// Enforce production URL in release builds to avoid cleartext/localhost Network Errors
export const ADMIN_API_BASE = (__DEV__ && ENV_ADMIN_API_BASE) ? ENV_ADMIN_API_BASE : defaultBaseUrl;

// Create a configured Axios instance
export const apiClient = axios.create({
  baseURL: ADMIN_API_BASE,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  // Cold serverless starts + Sentry-backed endpoints (logs) can take >10s.
  // 30s avoids spurious "Network Error" timeouts on otherwise-successful calls.
  timeout: 30000,
});

// Request Interceptor: Inject token and log request
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await getToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      if (__DEV__) console.warn('Failed to retrieve auth token', e);
    }

    // Never log request bodies — they can contain credentials
    if (__DEV__) {
      console.log(`[API REQUEST] ${config.method?.toUpperCase()} ${config.url}`);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Global error handling and log response
apiClient.interceptors.response.use(
  (response) => {
    if (__DEV__) {
      console.log(`[API RESPONSE] ${response.config.method?.toUpperCase()} ${response.config.url} - Status: ${response.status}`);
    }
    return response;
  },
  (error) => {
    if (__DEV__) {
      if (axios.isAxiosError(error)) {
        console.error(`[API ERROR] ${error.config?.method?.toUpperCase()} ${error.config?.url} - Status: ${error.response?.status || 'NETWORK_ERROR'}`);
      } else {
        console.error('[API UNKNOWN ERROR]', error);
      }
    }

    return Promise.reject(error);
  }
);
