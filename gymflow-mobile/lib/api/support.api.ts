import { apiClient } from './client';
import { parseApiError } from './error-handler';

export type SupportTicket = {
  id: string;
  gym_id: string;
  subject: string;
  message: string;
  type: string;
  status: string;
  rating: number | null;
  created_at: string;
  gyms: { name: string; owner_id: string };
};

export async function fetchTickets(): Promise<SupportTicket[]> {
  try {
    const { data } = await apiClient.get<SupportTicket[]>('/api/support/tickets');
    return data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

/**
 * Feedback for a single gym (gym-wise). Backed by the same /api/support/tickets
 * route, scoped with ?gymId=&type=feedback so the gym detail screen shows only
 * that gym's star-rated feedback.
 */
export async function fetchGymFeedback(gymId: string): Promise<SupportTicket[]> {
  try {
    const { data } = await apiClient.get<SupportTicket[]>('/api/support/tickets', {
      params: { gymId, type: 'feedback' },
    });
    return data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function sendSupportMessage(data: {
  gym_id: string;
  subject: string;
  body: string;
  type: string;
}): Promise<void> {
  try {
    await apiClient.post('/api/support', data);
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function resolveTicket(data: {
  ticketId: string;
  replySubject: string;
  replyMessage: string;
}): Promise<void> {
  try {
    await apiClient.patch('/api/support/tickets', {
      ticketId: data.ticketId,
      status: 'resolved',
      replySubject: data.replySubject,
      replyMessage: data.replyMessage,
    });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function clearTickets(ticketId?: string): Promise<void> {
  try {
    await apiClient.post('/api/support/tickets/clear', {
      ticketId,
      clearAll: !ticketId,
    });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
