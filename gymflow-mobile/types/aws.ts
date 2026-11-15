// Copy of gymflow-admin/lib/aws/types.ts (the admin API contract for GET /api/admin/aws/overview).
// The projects cannot import each other: keep this file in sync with the admin one.

// Shared contract for GET /api/admin/aws/overview. Consumed by the admin web page and (as a
// copy) by the mobile app, so keep it plain JSON: no Dates, no undefined, no class instances.

export type AwsRange = '1h' | '24h' | '7d'
export type AwsStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

/** t = unix epoch milliseconds, v = value for that bucket. */
export interface AwsPoint {
  t: number
  v: number
}

export interface AwsLambdaFn {
  name: string
  runtime: string
  memoryMb: number
  timeoutSec: number
  invocations: number
  errors: number
  throttles: number
  /** errors / invocations as a percentage, 0 when there were no invocations */
  errorRatePct: number
  p95DurationMs: number | null
  status: AwsStatus
  invocationsSeries: AwsPoint[]
  errorsSeries: AwsPoint[]
}

export interface AwsCloudFrontDist {
  id: string
  domain: string
  aliases: string[]
  enabled: boolean
  requests: number
  bytesDownloaded: number
  /** percentage of requests that returned 4xx / 5xx */
  rate4xxPct: number
  rate5xxPct: number
  status: AwsStatus
  requestsSeries: AwsPoint[]
  errors5xxSeries: AwsPoint[]
}

export interface AwsDynamoTable {
  name: string
  status: string
  itemCount: number | null
  sizeBytes: number | null
  consumedReadUnits: number
  consumedWriteUnits: number
  throttledRequests: number
  health: AwsStatus
  readSeries: AwsPoint[]
  writeSeries: AwsPoint[]
}

export interface AwsS3Bucket {
  name: string
  sizeBytes: number | null
  objectCount: number | null
}

export interface AwsCostByService {
  service: string
  amountUsd: number
}

export interface AwsBudgetInfo {
  name: string
  limitUsd: number
  actualUsd: number
  forecastUsd: number | null
  percentUsed: number
  /** state of the automatic block action: STANDBY (armed), PENDING/EXECUTION_IN_PROGRESS/EXECUTION_SUCCESS, etc. */
  blockActionStatus: string | null
  status: AwsStatus
}

export interface AwsCost {
  monthToDateUsd: number
  forecastUsd: number | null
  byService: AwsCostByService[]
  dailySeries: AwsPoint[]
  budget: AwsBudgetInfo | null
}

export interface AwsSectionError {
  section: 'lambda' | 'cloudfront' | 'dynamodb' | 's3' | 'cost'
  message: string
}

// ---- Per-resource detail: GET /api/admin/aws/resource?type=&id=&range= ----
// Deliberately generic (properties + charts) so one page renders every service type.

export type AwsResourceType = 'lambda' | 'cloudfront' | 'dynamodb' | 's3'
export type AwsChartUnit = 'count' | 'ms' | 'percent' | 'bytes' | 'units'

export interface AwsProperty {
  label: string
  value: string
}

export interface AwsChartSeries {
  label: string
  points: AwsPoint[]
}

export interface AwsChart {
  key: string
  title: string
  unit: AwsChartUnit
  series: AwsChartSeries[]
}

export interface AwsLogLine {
  t: number
  message: string
}

export interface AwsResourceDetail {
  type: AwsResourceType
  /** Lambda function name, CloudFront distribution id, DynamoDB table name or S3 bucket name. */
  id: string
  title: string
  subtitle: string
  status: AwsStatus
  range: AwsRange
  generatedAt: number
  /** Headline numbers for the window, shown as stat cards. */
  stats: AwsProperty[]
  /** Configuration details (never secrets or environment variable values). */
  properties: AwsProperty[]
  charts: AwsChart[]
  /** Lambda only: recent ERROR / WARN / timeout log lines in the window, newest first. Empty for other types. */
  recentLogs: AwsLogLine[]
  /** Parts that failed (e.g. logs) without failing the whole page. */
  errors: string[]
}

export interface AwsMonitorOverview {
  range: AwsRange
  generatedAt: number
  region: string
  lambda: AwsLambdaFn[]
  cloudfront: AwsCloudFrontDist[]
  dynamodb: AwsDynamoTable[]
  s3: AwsS3Bucket[]
  cost: AwsCost | null
  /** A failed section is reported here instead of being returned as an empty list. */
  errors: AwsSectionError[]
}
