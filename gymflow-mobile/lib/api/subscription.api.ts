import { apiClient } from './client';
import { parseApiError } from './error-handler';

// ── Types ─────────────────────────────────────────────────────────

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled' | 'suspended';
export type PlanType = 'trial' | 'monthly' | 'yearly' | 'lifetime';

export type GymFlags = {
  is_vip: boolean;
  is_payment_verified: boolean;
  whatsapp_enabled: boolean;
  priority_support: boolean;
  auto_renewal_eligible: boolean;
  lifetime_offer: boolean;
  login_disabled: boolean;
};

export type GymSubscriptionDetail = {
  id: string;
  name: string;
  owner_id: string;
  is_active: boolean;
  created_at: string;
  city?: string;
  phone?: string;
  // subscription
  subscription_status: SubscriptionStatus;
  plan_type: PlanType;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  subscription_started_at?: string | null;
  subscription_ends_at?: string | null;
  // notes + flags
  admin_notes?: string | null;
  // payment
  last_payment_amount?: number | null;
  last_payment_method?: string | null;
  last_transaction_id?: string | null;
  last_payment_date?: string | null;
  last_payment_status?: string | null;
} & GymFlags;

export type OwnerInfo = {
  email?: string;
  created_at?: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string | null;
  phone?: string;
};

export type PendingRequest = {
  id: string;
  gym_id: string;
  uploaded_file_url: string;
  transaction_id?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
};

export type AuditLog = {
  id: string;
  gym_id: string;
  prev_status?: string;
  new_status?: string;
  prev_plan?: string;
  new_plan?: string;
  prev_expiry?: string;
  new_expiry?: string;
  action: string;
  performed_by: string;
  notes?: string;
  created_at: string;
};

export type UsageStats = {
  gym_id: string;
  total_members: number;
  total_attendance: number;
  total_payments: number;
  total_revenue: number;
  whatsapp_sent: number;
  reports_generated: number;
  storage_used_kb: number;
  last_active_at?: string;
  updated_at: string;
};

export type SubscriptionDetailResponse = {
  gym: GymSubscriptionDetail;
  owner: OwnerInfo | null;
  pendingRequest: PendingRequest | null;
  lastApprovedRequest: PendingRequest | null;
  timeline: AuditLog[];
  usageStats: UsageStats | null;
};

// ── API Functions ─────────────────────────────────────────────────

export async function fetchSubscriptionDetail(gymId: string): Promise<SubscriptionDetailResponse> {
  try {
    const { data } = await apiClient.get<SubscriptionDetailResponse>(
      `/api/admin/gyms/${gymId}/subscription/detail`
    );
    return data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function activateSubscription(
  gymId: string,
  plan: 'monthly' | 'yearly' | 'lifetime',
  notes?: string
): Promise<void> {
  try {
    await apiClient.post(`/api/admin/gyms/${gymId}/subscription/activate`, { plan, notes });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function extendTrial(
  gymId: string,
  action: 'extend' | 'reset' | 'custom',
  days?: number,
  notes?: string
): Promise<void> {
  try {
    await apiClient.post(`/api/admin/gyms/${gymId}/subscription/trial`, { action, days, notes });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function expireSubscription(gymId: string, notes?: string): Promise<void> {
  try {
    await apiClient.post(`/api/admin/gyms/${gymId}/subscription/expire`, { notes });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function approvePayment(
  gymId: string,
  requestId: string,
  plan: 'monthly' | 'yearly' | 'lifetime',
  notes?: string
): Promise<void> {
  try {
    await apiClient.post(`/api/admin/gyms/${gymId}/subscription/payment/approve`, {
      request_id: requestId,
      plan,
      notes,
    });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function rejectPayment(
  gymId: string,
  requestId: string,
  rejectionReason: string
): Promise<void> {
  try {
    await apiClient.post(`/api/admin/gyms/${gymId}/subscription/payment/reject`, {
      request_id: requestId,
      rejection_reason: rejectionReason,
    });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function saveAdminNotes(
  gymId: string,
  payload: Partial<GymFlags> & { admin_notes?: string }
): Promise<void> {
  try {
    await apiClient.post(`/api/admin/gyms/${gymId}/subscription/notes`, payload);
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function updateSubscriptionDates(
  gymId: string,
  dates: {
    subscription_started_at?: string | null;
    subscription_ends_at?: string | null;
    trial_started_at?: string | null;
    trial_ends_at?: string | null;
  }
): Promise<void> {
  try {
    await apiClient.post(`/api/admin/gyms/${gymId}/subscription/dates`, dates);
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function executeDangerAction(
  gymId: string,
  action: 'delete_gym' | 'disable_login' | 'enable_login' | 'clear_subscription' | 'ban' | 'unban',
  notes?: string
): Promise<{ success: boolean; action: string }> {
  try {
    const { data } = await apiClient.post<{ success: boolean; action: string }>(
      `/api/admin/gyms/${gymId}/subscription/danger`,
      { action, notes }
    );
    return data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
