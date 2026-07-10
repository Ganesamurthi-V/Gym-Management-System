import { apiClient } from './client';
import { parseApiError } from './error-handler';

export type DashboardStats = {
  gymCount: number;
  memberCount: number;
  attendanceToday: number;
  errorCount: number;
  warningCount: number;
  recentMessages: Array<{
    id: string;
    subject: string;
    type: string;
    created_at: string;
    gym?: { name: string };
  }>;
  recentErrors: Array<{
    id: string;
    title: string;
    culprit: string;
    count: number;
    lastSeen: string;
  }>;
};

export async function fetchDashboardStats(): Promise<DashboardStats> {
  try {
    const { data } = await apiClient.get<DashboardStats>('/api/dashboard');
    return data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
