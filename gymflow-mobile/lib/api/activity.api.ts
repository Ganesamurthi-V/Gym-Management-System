import { apiClient } from './client';
import { parseApiError } from './error-handler';

export type ActivityKind = 'app_open' | 'page_view' | 'action';

export type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  path: string | null;
  label: string | null;
  /** Ready-made human sentence from the server, e.g. "Viewed Members". */
  title: string;
  platform: 'mobile' | 'desktop' | null;
  createdAt: string;
};

export type ActivitySummary = {
  lastOpenAt: string | null;
  opensLast7Days: number;
  opensLast15Days: number;
};

export type GymActivityResponse = {
  events: ActivityEvent[];
  nextBefore: string | null;
  summary: ActivitySummary;
};

export type ActivityQuery = {
  before?: string;
  kind?: ActivityKind | 'all';
  limit?: number;
};

export async function fetchGymActivity(
  gymId: string,
  { before, kind = 'all', limit = 50 }: ActivityQuery = {},
): Promise<GymActivityResponse> {
  try {
    // Unlike the other gym routes this one wraps its body: { success, data }.
    const { data: body } = await apiClient.get<{ success: boolean; data: GymActivityResponse }>(
      `/api/gyms/${gymId}/activity`,
      { params: { limit, kind, ...(before ? { before } : {}) } },
    );
    return body.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
