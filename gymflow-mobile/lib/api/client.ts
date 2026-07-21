import axios from 'axios';
import { getToken } from '../auth';

import { Platform } from 'react-native';
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
  // Default timeout of 10 seconds
  timeout: 10000,
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
      console.warn('Failed to retrieve auth token', e);
    }

    // Log the outgoing request
    console.log(`[API REQUEST] ${config.method?.toUpperCase()} ${config.url}`, config.data ? config.data : '');

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Global error handling and log response
apiClient.interceptors.response.use(
  (response) => {
    console.log(`[API RESPONSE] ${response.config.method?.toUpperCase()} ${response.config.url} - Status: ${response.status}`);
    return response;
  },
  (error) => {
    if (axios.isAxiosError(error)) {
      console.error(`[API ERROR] ${error.config?.method?.toUpperCase()} ${error.config?.url} - Status: ${error.response?.status || 'NETWORK_ERROR'}`);
      console.error('Error Details:', error.response?.data || error.message);
      
      // If we receive a 401 Unauthorized, we might want to log the user out
      if (error.response?.status === 401) {
        console.warn('Unauthorized (401) - Token may be invalid or expired');
      }
    } else {
      console.error('[API UNKNOWN ERROR]', error);
    }

    return Promise.reject(error);
  }
);
