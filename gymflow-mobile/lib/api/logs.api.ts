import { apiClient } from './client';
import { parseApiError } from './error-handler';

export type SentryEvent = {
  id: string;
  title: string;
  culprit?: string;
  level: string;
  dateCreated: string;
  tags?: Array<{ key: string; value: string }>;
};

export async function fetchEventLogs(): Promise<SentryEvent[]> {
  try {
    const { data } = await apiClient.get<SentryEvent[]>('/api/logs');
    return data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
