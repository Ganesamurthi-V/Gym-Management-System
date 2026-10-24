import { apiClient } from './client';
import { parseApiError } from './error-handler';

export interface SiteAnnouncement {
  message: string;
  message_after: string;
  level: 'info' | 'warning' | 'critical';
  link_url: string | null;
  link_label: string | null;
  is_active: boolean;
  version: number;
  updated_at: string | null;
}

// Both verbs answer { ok: true, announcement: <row> }.
function unwrap(body: any): SiteAnnouncement {
  // message_after may be absent until the server's column is migrated.
  return { ...body.announcement, message_after: body.announcement?.message_after ?? '' } as SiteAnnouncement;
}

export async function getAnnouncement(): Promise<SiteAnnouncement> {
  try {
    const { data } = await apiClient.get('/api/announcements');
    return unwrap(data);
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function saveAnnouncement(data: {
  message: string;
  message_after?: string;
  level: SiteAnnouncement['level'];
  link_url?: string | null;
  link_label?: string | null;
  is_active: boolean;
}): Promise<SiteAnnouncement> {
  try {
    const res = await apiClient.put('/api/announcements', data);
    return unwrap(res.data);
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
