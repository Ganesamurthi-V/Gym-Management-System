import 'server-only'
import { GetFunctionConfigurationCommand, GetFunctionConcurrencyCommand } from '@aws-sdk/client-lambda'
import { GetDistributionCommand } from '@aws-sdk/client-cloudfront'
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb'
import { FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs'
import { APP_REGION, GLOBAL_REGION, lambdaClient, cloudFront, dynamo, cloudWatchLogs } from './clients'
import { cached } from './cache'
import { buildRange, cloudfrontStatus, dynamoStatus, lambdaStatus, pct } from './status'
import {
  cloudFrontInventory, dynamoInventory, lambdaInventory, s3Inventory, metricData, sum, max, type Q,
} from './overview'
import {
  inventoryHas, s3Window, trimLogMessage, fmtBytes, fmtNum, fmtMs, LOG_LIMIT,
} from './detailHelpers'
import type {
  AwsChart, AwsChartUnit, AwsLogLine, AwsPoint, AwsProperty, AwsRange, AwsResourceDetail, AwsResourceType, AwsStatus,
} from './types'

const DETAIL_TTL = 60_000
const LOG_PATTERN = '?ERROR ?WARN ?"Task timed out"'
const LOG_MAX_PAGES = 5

/** The route maps this to a 404. Thrown before any AWS metric or log call is made. */
export class ResourceNotFoundError extends Error {
  constructor(type: AwsResourceType, id: string) {
    super(`${type} "${id}" not found`)
    this.name = 'ResourceNotFoundError'
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const iso = (d: Date | undefined) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'Unknown')
const q = (id: string, ns: string, metric: string, stat: string, dims: Record<string, string>): Q => ({ id, ns, metric, stat, dims })
const last = (pts: AwsPoint[] | undefined) => (pts?.length ? pts[pts.length - 1].v : null)

function chart(key: string, title: string, unit: AwsChartUnit, series: [string, AwsPoint[] | undefined][]): AwsChart {
  return { key, title, unit, series: series.map(([label, points]) => ({ label, points: points ?? [] })) }
}

interface Base { title: string; subtitle: string; status: AwsStatus; stats: AwsProperty[]; properties: AwsProperty[]; charts: AwsChart[]; recentLogs: AwsLogLine[]; errors: string[] }

// ---------- Lambda ----------

async function recentLogs(logGroupName: string, start: number, end: number): Promise<AwsLogLine[]> {
  const lines: AwsLogLine[] = []
  let nextToken: string | undefined
  // FilterLogEvents returns oldest first, so page through the window and keep the newest at the end.
  for (let page = 0; page < LOG_MAX_PAGES; page++) {
    const res = await cloudWatchLogs(APP_REGION).send(new FilterLogEventsCommand({
      logGroupName, startTime: start, endTime: end, filterPattern: LOG_PATTERN, nextToken,
    }))
    for (const e of res.events ?? []) lines.push({ t: e.timestamp ?? 0, message: trimLogMessage(e.message ?? '') })
    nextToken = res.nextToken
    if (!nextToken) break
  }
  return lines.sort((a, b) => b.t - a.t).slice(0, LOG_LIMIT)
}

async function lambdaDetail(name: string, range: AwsRange): Promise<Base> {
  const { start, end, periodSec } = buildRange(range, Date.now())
  const dims = { FunctionName: name }
  const errors: string[] = []
  const cfgP = lambdaClient(APP_REGION).send(new GetFunctionConfigurationCommand({ FunctionName: name }))
  const [cfg, conc, data, logs] = await Promise.allSettled([
    cfgP,
    lambdaClient(APP_REGION).send(new GetFunctionConcurrencyCommand({ FunctionName: name })),
    metricData(APP_REGION, [
      q('i', 'AWS/Lambda', 'Invocations', 'Sum', dims), q('e', 'AWS/Lambda', 'Errors', 'Sum', dims),
      q('t', 'AWS/Lambda', 'Throttles', 'Sum', dims), q('da', 'AWS/Lambda', 'Duration', 'Average', dims),
      q('dp', 'AWS/Lambda', 'Duration', 'p95', dims), q('dm', 'AWS/Lambda', 'Duration', 'Maximum', dims),
      q('c', 'AWS/Lambda', 'ConcurrentExecutions', 'Maximum', dims),
    ], start, end, periodSec),
    // SST gives functions a custom log group (not /aws/lambda/<name>), so read it from the function's
    // own config. Only Lambda log groups are allowed, matching the IAM scope.
    cfgP.then((c) => {
      const group = c.LoggingConfig?.LogGroup ?? `/aws/lambda/${name}`
      if (!group.startsWith('/aws/lambda/')) throw new Error('log group is not under /aws/lambda/')
      return recentLogs(group, start, end)
    }),
  ])
  if (data.status === 'rejected') throw data.reason
  const d = data.value
  const invocations = sum(d.get('i') ?? []), errs = sum(d.get('e') ?? []), throttles = sum(d.get('t') ?? [])

  const properties: AwsProperty[] = [{ label: 'Region', value: APP_REGION }]
  if (cfg.status === 'fulfilled') {
    const c = cfg.value
    properties.push(
      { label: 'Runtime', value: c.Runtime ?? c.PackageType ?? 'unknown' },
      { label: 'Architecture', value: (c.Architectures ?? []).join(', ') || 'x86_64' },
      { label: 'Memory', value: `${c.MemorySize ?? 0} MB` },
      { label: 'Timeout', value: `${c.Timeout ?? 0} s` },
      { label: 'Handler', value: c.Handler ?? 'n/a' },
      { label: 'Code size', value: fmtBytes(c.CodeSize ?? 0) },
      { label: 'Last modified', value: c.LastModified ?? 'Unknown' },
      { label: 'Ephemeral storage', value: `${c.EphemeralStorage?.Size ?? 512} MB` },
      // Count only: environment variable names and values can reveal secrets.
      { label: 'Environment variables', value: String(Object.keys(c.Environment?.Variables ?? {}).length) },
    )
  } else errors.push(`Configuration: ${msg(cfg.reason)}`)
  if (conc.status === 'fulfilled') {
    const r = conc.value.ReservedConcurrentExecutions
    properties.push({ label: 'Concurrency', value: r === undefined ? 'Unreserved' : `${r} reserved` })
  } else errors.push(`Concurrency: ${msg(conc.reason)}`)
  if (logs.status === 'rejected') errors.push(`Logs: ${msg(logs.reason)}`)

  return {
    title: name, subtitle: `Lambda function · ${APP_REGION}`,
    status: lambdaStatus(invocations, errs, throttles),
    stats: [
      { label: 'Invocations', value: fmtNum(invocations) }, { label: 'Errors', value: fmtNum(errs) },
      { label: 'Error rate', value: `${pct(errs, invocations).toFixed(2)}%` }, { label: 'Throttles', value: fmtNum(throttles) },
      { label: 'p95 duration', value: fmtMs(max(d.get('dp') ?? [])) },
      { label: 'Max concurrency', value: fmtNum(max(d.get('c') ?? []) ?? 0) },
    ],
    properties,
    charts: [
      chart('invocations', 'Invocations, errors and throttles', 'count',
        [['Invocations', d.get('i')], ['Errors', d.get('e')], ['Throttles', d.get('t')]]),
      chart('duration', 'Duration', 'ms', [['Average', d.get('da')], ['p95', d.get('dp')], ['Max', d.get('dm')]]),
      chart('concurrency', 'Concurrent executions', 'count', [['Max', d.get('c')]]),
    ],
    recentLogs: logs.status === 'fulfilled' ? logs.value : [], errors,
  }
}

// ---------- CloudFront ----------

async function cloudfrontDetail(id: string, range: AwsRange): Promise<Base> {
  const { start, end, periodSec } = buildRange(range, Date.now())
  // CloudFront publishes its metrics only to us-east-1, under Region=Global.
  const dims = { DistributionId: id, Region: 'Global' }
  const ns = 'AWS/CloudFront'
  const [dist, data] = await Promise.allSettled([
    cloudFront().send(new GetDistributionCommand({ Id: id })),
    metricData(GLOBAL_REGION, [
      q('r', ns, 'Requests', 'Sum', dims), q('bd', ns, 'BytesDownloaded', 'Sum', dims), q('bu', ns, 'BytesUploaded', 'Sum', dims),
      q('f', ns, '4xxErrorRate', 'Average', dims), q('g', ns, '5xxErrorRate', 'Average', dims),
      q('h', ns, 'TotalErrorRate', 'Average', dims),
    ], start, end, periodSec),
  ])
  if (data.status === 'rejected') throw data.reason
  const d = data.value
  const req = d.get('r') ?? []
  const requests = sum(req)
  // Weight each bucket's rate by its request count so a quiet bucket does not skew the overall rate.
  const weighted = (key: string) => {
    const byT = new Map((d.get(key) ?? []).map((p) => [p.t, p.v]))
    // The rates are already percentages, so this is a weighted mean (no further x100).
    return requests > 0 ? req.reduce((a, p) => a + (byT.get(p.t) ?? 0) * p.v, 0) / requests : 0
  }
  const r4 = weighted('f'), r5 = weighted('g')

  const errors: string[] = []
  const properties: AwsProperty[] = []
  let title = id
  if (dist.status === 'fulfilled') {
    const x = dist.value.Distribution
    const c = x?.DistributionConfig
    title = x?.DomainName ?? id
    properties.push(
      { label: 'Domain', value: x?.DomainName ?? 'Unknown' },
      { label: 'Aliases', value: (c?.Aliases?.Items ?? []).join(', ') || 'None' },
      { label: 'Status', value: x?.Status ?? 'Unknown' },
      { label: 'Enabled', value: c?.Enabled ? 'Yes' : 'No' },
      { label: 'Price class', value: c?.PriceClass ?? 'Unknown' },
      { label: 'HTTP version', value: c?.HttpVersion ?? 'Unknown' },
      { label: 'Origins', value: (c?.Origins?.Items ?? []).map((o) => o.DomainName).join(', ') || 'None' },
      { label: 'WAF attached', value: c?.WebACLId ? 'Yes' : 'No' },
      { label: 'Last modified', value: iso(x?.LastModifiedTime) },
    )
  } else errors.push(`Distribution: ${msg(dist.reason)}`)

  return {
    title, subtitle: 'CloudFront distribution · Global',
    status: cloudfrontStatus(r5, r4, requests),
    stats: [
      { label: 'Requests', value: fmtNum(requests) }, { label: 'Data out', value: fmtBytes(sum(d.get('bd') ?? [])) },
      { label: '4xx rate', value: `${r4.toFixed(2)}%` }, { label: '5xx rate', value: `${r5.toFixed(2)}%` },
    ],
    properties,
    charts: [
      chart('requests', 'Requests', 'count', [['Requests', req]]),
      chart('bytes', 'Data transfer', 'bytes', [['Downloaded', d.get('bd')], ['Uploaded', d.get('bu')]]),
      chart('errors', 'Error rate', 'percent', [['4xx', d.get('f')], ['5xx', d.get('g')], ['Total', d.get('h')]]),
    ],
    recentLogs: [], errors,
  }
}

// ---------- DynamoDB ----------

async function dynamoDetail(name: string, range: AwsRange): Promise<Base> {
  const { start, end, periodSec } = buildRange(range, Date.now())
  const ns = 'AWS/DynamoDB'
  const dims = { TableName: name }
  const ops = ['GetItem', 'PutItem', 'Query']
  const [desc, data] = await Promise.allSettled([
    dynamo(APP_REGION).send(new DescribeTableCommand({ TableName: name })),
    metricData(APP_REGION, [
      q('r', ns, 'ConsumedReadCapacityUnits', 'Sum', dims), q('w', ns, 'ConsumedWriteCapacityUnits', 'Sum', dims),
      q('x', ns, 'ReadThrottleEvents', 'Sum', dims), q('y', ns, 'WriteThrottleEvents', 'Sum', dims),
      ...ops.map((op) => q(`l${op}`, ns, 'SuccessfulRequestLatency', 'Average', { ...dims, Operation: op })),
    ], start, end, periodSec),
  ])
  if (data.status === 'rejected') throw data.reason
  const d = data.value
  const throttled = sum(d.get('x') ?? []) + sum(d.get('y') ?? [])

  const errors: string[] = []
  const properties: AwsProperty[] = [{ label: 'Region', value: APP_REGION }]
  let items: number | null = null, size: number | null = null
  if (desc.status === 'fulfilled') {
    const t = desc.value.Table
    items = t?.ItemCount ?? null
    size = t?.TableSizeBytes ?? null
    properties.push(
      { label: 'Status', value: t?.TableStatus ?? 'Unknown' },
      { label: 'Billing mode', value: t?.BillingModeSummary?.BillingMode ?? 'PROVISIONED' },
      { label: 'Keys', value: (t?.KeySchema ?? []).map((k) => `${k.AttributeName} (${k.KeyType})`).join(', ') || 'Unknown' },
      { label: 'Global secondary indexes', value: String(t?.GlobalSecondaryIndexes?.length ?? 0) },
      { label: 'Created', value: iso(t?.CreationDateTime) },
      { label: 'Table class', value: t?.TableClassSummary?.TableClass ?? 'STANDARD' },
      { label: 'Deletion protection', value: t?.DeletionProtectionEnabled ? 'On' : 'Off' },
    )
  } else errors.push(`Table: ${msg(desc.reason)}`)

  return {
    title: name, subtitle: `DynamoDB table · ${APP_REGION}`,
    status: dynamoStatus(throttled),
    stats: [
      { label: 'Items', value: items === null ? 'Unknown' : fmtNum(items) },
      { label: 'Size', value: size === null ? 'Unknown' : fmtBytes(size) },
      { label: 'Consumed RCU', value: fmtNum(sum(d.get('r') ?? [])) }, { label: 'Consumed WCU', value: fmtNum(sum(d.get('w') ?? [])) },
      { label: 'Throttles', value: fmtNum(throttled) },
    ],
    properties,
    charts: [
      chart('consumed', 'Consumed capacity', 'units', [['Read', d.get('r')], ['Write', d.get('w')]]),
      chart('throttles', 'Throttle events', 'count', [['Read', d.get('x')], ['Write', d.get('y')]]),
      // An operation with no data (e.g. a table never queried) would be an empty line, so drop it.
      chart('latency', 'Successful request latency', 'ms',
        ops.map((op): [string, AwsPoint[] | undefined] => [op, d.get(`l${op}`)]).filter(([, pts]) => pts && pts.length)),
    ],
    recentLogs: [], errors,
  }
}

// ---------- S3 ----------

async function s3Detail(name: string, region: string, created: number | null): Promise<Base> {
  // Storage metrics are daily, so the window never follows the requested range.
  const { start, end, periodSec } = s3Window(Date.now())
  const data = await metricData(region, [
    q('s', 'AWS/S3', 'BucketSizeBytes', 'Average', { BucketName: name, StorageType: 'StandardStorage' }),
    q('n', 'AWS/S3', 'NumberOfObjects', 'Average', { BucketName: name, StorageType: 'AllStorageTypes' }),
  ], start, end, periodSec)
  const size = last(data.get('s')), objects = last(data.get('n'))
  return {
    title: name, subtitle: `S3 bucket · ${region}`,
    status: size === null && objects === null ? 'unknown' : 'healthy',
    stats: [
      { label: 'Size', value: size === null ? 'Unknown' : fmtBytes(size) },
      { label: 'Objects', value: objects === null ? 'Unknown' : fmtNum(objects) },
    ],
    properties: [
      { label: 'Region', value: region },
      { label: 'Created', value: created === null ? 'Unknown' : iso(new Date(created)) },
    ],
    charts: [
      chart('size', 'Bucket size (daily)', 'bytes', [['Size', data.get('s')]]),
      chart('objects', 'Number of objects (daily)', 'count', [['Objects', data.get('n')]]),
    ],
    recentLogs: [], errors: [],
  }
}

export async function getAwsResourceDetail(type: AwsResourceType, id: string, range: AwsRange): Promise<AwsResourceDetail> {
  return cached(`detail:${type}:${id}:${range}`, DETAIL_TTL, async () => {
    // Allowlist first: only resources in the discovered inventory may be queried, so this endpoint
    // cannot be pointed at arbitrary log groups, tables or ARNs.
    let base: Base
    switch (type) {
      case 'lambda':
        if (!inventoryHas((await lambdaInventory()).map((f) => f.name), id)) throw new ResourceNotFoundError(type, id)
        base = await lambdaDetail(id, range)
        break
      case 'cloudfront':
        if (!inventoryHas((await cloudFrontInventory()).map((x) => x.id), id)) throw new ResourceNotFoundError(type, id)
        base = await cloudfrontDetail(id, range)
        break
      case 'dynamodb':
        if (!inventoryHas((await dynamoInventory()).map((t) => t.name), id)) throw new ResourceNotFoundError(type, id)
        base = await dynamoDetail(id, range)
        break
      case 's3': {
        const b = (await s3Inventory()).find((x) => x.name === id)
        if (!b) throw new ResourceNotFoundError(type, id)
        base = await s3Detail(id, b.region, b.created)
        break
      }
    }
    return { type, id, range, generatedAt: Date.now(), ...base }
  })
}
