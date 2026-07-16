import { apiClient } from './client';
import { parseApiError } from './error-handler';

export type Gym = {
  id: string;
  name: string;
  created_at: string;
  is_active: boolean;
  memberCount: number;
  owner?: { email: string };
};

export type GymDetail = {
  gym: {
    id: string;
    name: string;
    owner_id: string;
    created_at: string;
    is_active: boolean;
    subscription_status?: string;
    plan_type?: string;
    trial_ends_at?: string;
    subscription_ends_at?: string;
  };
  owner: {
    email?: string;
    created_at?: string;
    last_sign_in_at?: string;
    email_confirmed_at?: string | null;
  } | null;
};

export async function fetchGyms(): Promise<Gym[]> {
  try {
    const { data } = await apiClient.get<Gym[]>('/api/gyms');
    return data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function fetchGymDetail(gymId: string): Promise<GymDetail> {
  try {
    const { data } = await apiClient.get<GymDetail>(`/api/gyms/${gymId}`);
    return data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function toggleGymStatus(gymId: string, isActive: boolean): Promise<void> {
  try {
    await apiClient.patch(`/api/gyms/${gymId}/status`, { is_active: isActive });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function resetGymPassword(userId: string, newPassword: string): Promise<void> {
  try {
    await apiClient.post('/api/gyms/reset-password', { userId, password: newPassword });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export type GymSubscriptionData = {
  subscription_status?: string;
  plan_type?: string;
  trial_ends_at?: string | null;
  subscription_ends_at?: string | null;
};

export async function updateGymSubscription(gymId: string, data: GymSubscriptionData): Promise<void> {
  try {
    await apiClient.patch(`/api/gyms/${gymId}/subscription`, data);
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
