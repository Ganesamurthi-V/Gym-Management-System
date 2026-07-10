import { apiClient } from './client';
import { parseApiError } from './error-handler';

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
  try {
    const { data } = await apiClient.get<SupportTicket[]>('/api/support/tickets');
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
