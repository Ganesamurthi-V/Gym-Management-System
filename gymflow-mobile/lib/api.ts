import { getToken } from './auth';

// ─── Configure this to your gymflow-admin deployment URL ───────────────────
// For local dev on same network: use your PC's LAN IP e.g. http://192.168.1.x:3001
// For production: use your deployed URL e.g. https://admin.gymflow.in
export const ADMIN_API_BASE = 'http://localhost:3001';

// ─────────────────────────────────────────────────────────────────────────────

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: object;
};

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const token = await getToken();
  const url = `${ADMIN_API_BASE}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error?.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export async function loginWithPassword(password: string): Promise<string> {
  const res = await fetch(`${ADMIN_API_BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? 'Invalid password');
  }

  // The web admin returns a JWT in JSON or sets a cookie
  // For mobile, we use the ADMIN_PANEL_SECRET directly as bearer token
  // Store the password itself as bearer token (matches verifyRequestAuth)
  return password;
}

// ─── Gyms ────────────────────────────────────────────────────────────────────
export type Gym = {
  id: string;
  name: string;
  created_at: string;
  is_active: boolean;
  memberCount: number;
  owner?: { email: string };
};

export async function fetchGyms(): Promise<Gym[]> {
  return apiFetch<Gym[]>('/api/gyms');
}

export async function fetchGymDetail(gymId: string): Promise<{
  gym: {
    id: string;
    name: string;
    owner_id: string;
    created_at: string;
    is_active: boolean;
  };
  owner: {
    email?: string;
    created_at?: string;
    last_sign_in_at?: string;
    email_confirmed_at?: string | null;
  } | null;
}> {
  return apiFetch(`/api/gyms/${gymId}`);
}

export async function toggleGymStatus(gymId: string, isActive: boolean): Promise<void> {
  await apiFetch(`/api/gyms/${gymId}/status`, {
    method: 'PATCH',
    body: { is_active: isActive },
  });
}

export async function resetGymPassword(userId: string, newPassword: string): Promise<void> {
  await apiFetch('/api/gyms/reset-password', {
    method: 'POST',
    body: { userId, password: newPassword },
  });
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
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
  return apiFetch<DashboardStats>('/api/dashboard');
}

// ─── Support ─────────────────────────────────────────────────────────────────
export type SupportTicket = {
  id: string;
  gym_id: string;
  subject: string;
  message: string;
  type: string;
  status: string;
  created_at: string;
  gyms: { name: string; owner_id: string };
};

export async function fetchTickets(): Promise<SupportTicket[]> {
  return apiFetch<SupportTicket[]>('/api/support/tickets');
}

export async function sendSupportMessage(data: {
  gym_id: string;
  subject: string;
  body: string;
  type: string;
}): Promise<void> {
  await apiFetch('/api/support', { method: 'POST', body: data });
}

export async function resolveTicket(data: {
  ticketId: string;
  replySubject: string;
  replyMessage: string;
}): Promise<void> {
  await apiFetch('/api/support/tickets', {
    method: 'PATCH',
    body: { ticketId: data.ticketId, status: 'resolved', replySubject: data.replySubject, replyMessage: data.replyMessage },
  });
}

export async function clearTickets(ticketId?: string): Promise<void> {
  await apiFetch('/api/support/tickets/clear', {
    method: 'POST',
    body: { ticketId, clearAll: !ticketId },
  });
}

// ─── Logs ────────────────────────────────────────────────────────────────────
export type SentryEvent = {
  id: string;
  title: string;
  culprit?: string;
  level: string;
  dateCreated: string;
  tags?: Array<{ key: string; value: string }>;
};

export async function fetchEventLogs(): Promise<SentryEvent[]> {
  return apiFetch<SentryEvent[]>('/api/logs');
}
