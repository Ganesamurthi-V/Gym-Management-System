import { apiClient } from './client';
import { parseApiError } from './error-handler';
import type { AwsMonitorOverview, AwsRange, AwsResourceDetail, AwsResourceType } from '@/types/aws';

type AwsOverviewResponse =
  | { success: true; data: AwsMonitorOverview }
  | { success: false; error: { code: string; message: string } };

export async function getAwsOverview(range: AwsRange): Promise<AwsMonitorOverview> {
  let body: AwsOverviewResponse;
  try {
    const res = await apiClient.get<AwsOverviewResponse>('/api/admin/aws/overview', { params: { range } });
    body = res.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
  if (!body.success) throw new Error(body.error?.message ?? 'Could not load AWS data');
  return body.data;
}

type AwsResourceResponse =
  | { success: true; data: AwsResourceDetail }
  | { success: false; error: { code: string; message: string } };

export async function getAwsResourceDetail(
  type: AwsResourceType, id: string, range: AwsRange,
): Promise<AwsResourceDetail> {
  let body: AwsResourceResponse;
  try {
    const res = await apiClient.get<AwsResourceResponse>('/api/admin/aws/resource', { params: { type, id, range } });
    body = res.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
  if (!body.success) throw new Error(body.error?.message ?? 'Could not load AWS resource');
  return body.data;
}
