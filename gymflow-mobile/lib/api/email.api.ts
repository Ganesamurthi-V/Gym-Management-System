import { apiClient } from './client';
import { parseApiError } from './error-handler';

export type EmailThreadStatus = 'open' | 'archived';

export type EmailThread = {
  id: string;
  subject: string;
  counterparty_email: string;
  counterparty_name: string | null;
  gym_id: string | null;
  status: EmailThreadStatus;
  snippet: string | null;
  last_message_at: string;
  last_direction: 'inbound' | 'outbound' | null;
  unread_count: number;
  gyms: { name: string } | null;
};

export type EmailThreadsResponse = {
  threads: EmailThread[];
  nextCursor: string | null;
  /** Unread messages across all open threads: the tab badge. */
  unreadTotal: number;
};

export type EmailAttachment = {
  id: string;
  filename: string | null;
  content_type: string;
  size: number;
};

export type EmailMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  subject: string;
  body_text: string | null;
  auth_result: { spf: string | null; dkim: string | null; dmarc: string | null } | null;
  attachments: EmailAttachment[];
  is_auto: boolean;
  status: 'received' | 'sending' | 'sent' | 'failed';
  error: string | null;
  created_at: string;
};

export type AiDraftStatus = 'none' | 'ready' | 'queued' | 'failed' | 'skipped';

export type EmailThreadDetail = {
  thread: Omit<EmailThread, 'snippet' | 'last_direction'> & {
    /** A suggested reply, present only while it answers the newest inbound message. */
    ai_draft: string | null;
    ai_draft_status: AiDraftStatus;
    /** The model judged this needs a person; the draft is only a holding reply. */
    ai_needs_human: boolean;
  };
  messages: EmailMessage[];
};

export async function fetchEmailThreads(
  status: EmailThreadStatus,
  cursor?: string | null,
): Promise<EmailThreadsResponse> {
  try {
    const { data } = await apiClient.get<EmailThreadsResponse>('/api/email/threads', {
      params: { status, ...(cursor ? { cursor } : {}) },
    });
    return data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

/** Opening a thread marks it read on the server, so the unread badge clears. */
export async function fetchEmailThread(id: string): Promise<EmailThreadDetail> {
  try {
    const { data } = await apiClient.get<EmailThreadDetail>(`/api/email/threads/${id}`);
    return data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function setEmailThreadStatus(id: string, status: EmailThreadStatus): Promise<void> {
  try {
    await apiClient.patch(`/api/email/threads/${id}`, { status });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

/** A file picked on the phone, waiting to be sent with a reply. */
export type LocalAttachment = { uri: string; name: string; type: string; size: number };

/**
 * The recipient is decided by the server (always the thread's other party), so this takes
 * no address. `text` is the editor's markup (**bold**, _italic_, lists, links); the server
 * turns it into the email. `retryMessageId` re-sends a reply that failed, reusing its row.
 *
 * With attachments the request is multipart form data (the phone streams each file by its
 * uri, no base64); without them it stays a small JSON body.
 */
export async function replyToEmailThread(
  id: string,
  text: string,
  retryMessageId?: string,
  attachments: LocalAttachment[] = [],
): Promise<void> {
  try {
    if (attachments.length === 0) {
      await apiClient.post(`/api/email/threads/${id}/reply`, { text, retryMessageId });
      return;
    }
    const form = new FormData();
    form.append('text', text);
    if (retryMessageId) form.append('retryMessageId', retryMessageId);
    for (const a of attachments) {
      // React Native's FormData reads the file from the uri when the request is sent.
      form.append('attachments', { uri: a.uri, name: a.name, type: a.type } as unknown as Blob);
    }
    await apiClient.post(`/api/email/threads/${id}/reply`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 90_000,
      transformRequest: data => data,
    });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

/** Deletes the conversation and all its messages for good. */
export async function deleteEmailThread(id: string): Promise<void> {
  try {
    await apiClient.delete(`/api/email/threads/${id}`);
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

/** "Delete all" for one list (the tab the admin is looking at). */
export async function deleteAllEmailThreads(status: EmailThreadStatus): Promise<void> {
  try {
    await apiClient.delete('/api/email/threads', { params: { status } });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export type RegenerateDraftResponse = {
  outcome: string;
  draft: string | null;
  status: AiDraftStatus;
  needsHuman: boolean;
};

/** Writes a fresh AI draft. Server-side budgeting means this cannot exhaust the free quota. */
export async function regenerateEmailDraft(id: string): Promise<RegenerateDraftResponse> {
  try {
    const { data } = await apiClient.post<RegenerateDraftResponse>(`/api/email/threads/${id}/draft`);
    return data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

/** Dismiss: drops the draft. Nothing is sent. */
export async function dismissEmailDraft(id: string): Promise<void> {
  try {
    await apiClient.delete(`/api/email/threads/${id}/draft`);
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export type EmailAttachmentLink = {
  url: string;
  expiresAt: string;
  filename: string;
  contentType: string;
  size: number;
};

/** A fresh one-hour download link, requested at the moment of the tap. */
export async function fetchEmailAttachmentLink(
  messageId: string,
  attachmentId: string,
): Promise<EmailAttachmentLink> {
  try {
    const { data } = await apiClient.get<EmailAttachmentLink>(
      `/api/email/attachments/${messageId}/${attachmentId}`,
    );
    return data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
