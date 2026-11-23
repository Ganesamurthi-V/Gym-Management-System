import 'server-only'
import { ListFunctionsCommand } from '@aws-sdk/client-lambda'
import { ListDistributionsCommand } from '@aws-sdk/client-cloudfront'
import { ListTablesCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb'
import { ListBucketsCommand } from '@aws-sdk/client-s3'
import { GetMetricDataCommand, type MetricDataQuery } from '@aws-sdk/client-cloudwatch'
import { GetCostAndUsageCommand, GetCostForecastCommand } from '@aws-sdk/client-cost-explorer'
import { DescribeBudgetCommand, DescribeBudgetActionsForBudgetCommand } from '@aws-sdk/client-budgets'
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import {
  APP_REGION, GLOBAL_REGION, cloudWatch, lambdaClient, cloudFront, dynamo, s3, costExplorer, budgets, sts,
} from './clients'
import { cached } from './cache'
import { buildRange, budgetStatus, cloudfrontStatus, dynamoStatus, lambdaStatus, pct } from './status'
import type {
  AwsBudgetInfo, AwsCloudFrontDist, AwsCost, AwsDynamoTable, AwsLambdaFn, AwsMonitorOverview, AwsPoint,
  AwsRange, AwsS3Bucket, AwsSectionError,
} from './types'

const BUDGET_NAME = 'Gymflow-Monthly-5USD'
const METRICS_TTL = 60_000
const DISCOVERY_TTL = 5 * 60_000
// Cost Explorer bills $0.01 per request and its data only refreshes a few times a day.
const COST_TTL = 6 * 3_600_000
const MAX_QUERIES = 500

export const sum = (pts: AwsPoint[]) => pts.reduce((a, p) => a + p.v, 0)
export const max = (pts: AwsPoint[]) => (pts.length ? Math.max(...pts.map((p) => p.v)) : null)
const round2 = (n: number) => Math.round(n * 100) / 100
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export interface Q {
  id: string
  ns: string
  metric: string
  dims: Record<string, string>
  stat: string
}

/** Runs the queries in batches of 500, following NextToken, and returns series by query id. */
export async function metricData(
  region: string, qs: Q[], start: number, end: number, periodSec: number,
): Promise<Map<string, AwsPoint[]>> {
  const out = new Map<string, AwsPoint[]>()
  const batches: Q[][] = []
  for (let i = 0; i < qs.length; i += MAX_QUERIES) batches.push(qs.slice(i, i + MAX_QUERIES))
  await Promise.all(batches.map(async (batch) => {
    const MetricDataQueries: MetricDataQuery[] = batch.map((q) => ({
      Id: q.id,
      ReturnData: true,
      MetricStat: {
        Metric: {
          Namespace: q.ns,
          MetricName: q.metric,
          Dimensions: Object.entries(q.dims).map(([Name, Value]) => ({ Name, Value })),
        },
        Period: periodSec,
        Stat: q.stat,
      },
    }))
    let NextToken: string | undefined
    do {
      const res = await cloudWatch(region).send(new GetMetricDataCommand({
        MetricDataQueries, StartTime: new Date(start), EndTime: new Date(end), NextToken, ScanBy: 'TimestampAscending',
      }))
      for (const r of res.MetricDataResults ?? []) {
        const pts = out.get(r.Id!) ?? []
        ;(r.Timestamps ?? []).forEach((t, i) => pts.push({ t: t.getTime(), v: r.Values?.[i] ?? 0 }))
        out.set(r.Id!, pts)
      }
      NextToken = res.NextToken
    } while (NextToken)
  }))
  for (const pts of out.values()) pts.sort((a, b) => a.t - b.t)
  return out
}

// ---------- Lambda ----------

// Shared with detail.ts, which uses the inventories as an allowlist of ids it may query.
export const lambdaInventory = () => cached('lambda:discover', DISCOVERY_TTL, async () => {
    const list: { name: string; runtime: string; memoryMb: number; timeoutSec: number }[] = []
    let Marker: string | undefined
    do {
      const res = await lambdaClient(APP_REGION).send(new ListFunctionsCommand({ Marker }))
      for (const f of res.Functions ?? []) {
        list.push({
          name: f.FunctionName!, runtime: f.Runtime ?? f.PackageType ?? 'unknown',
          memoryMb: f.MemorySize ?? 0, timeoutSec: f.Timeout ?? 0,
        })
      }
      Marker = res.NextMarker
    } while (Marker)
    return list
  })

async function getLambda(range: AwsRange): Promise<AwsLambdaFn[]> {
  const fns = await lambdaInventory()
  return cached(`lambda:metrics:${range}`, METRICS_TTL, async () => {
    const { start, end, periodSec } = buildRange(range, Date.now())
    const qs: Q[] = fns.flatMap((f, i) => {
      const dims = { FunctionName: f.name }
      return [
        { id: `i${i}`, metric: 'Invocations', stat: 'Sum' },
        { id: `e${i}`, metric: 'Errors', stat: 'Sum' },
        { id: `t${i}`, metric: 'Throttles', stat: 'Sum' },
        { id: `p${i}`, metric: 'Duration', stat: 'p95' },
      ].map((m) => ({ ...m, ns: 'AWS/Lambda', dims }))
    })
    const data = await metricData(APP_REGION, qs, start, end, periodSec)
    return fns.map((f, i): AwsLambdaFn => {
      const inv = data.get(`i${i}`) ?? []
      const err = data.get(`e${i}`) ?? []
      const invocations = sum(inv), errors = sum(err), throttles = sum(data.get(`t${i}`) ?? [])
      return {
        ...f, invocations, errors, throttles,
        errorRatePct: pct(errors, invocations),
        p95DurationMs: max(data.get(`p${i}`) ?? []),
        status: lambdaStatus(invocations, errors, throttles),
        invocationsSeries: inv, errorsSeries: err,
      }
    })
  })
}

// ---------- CloudFront ----------

export const cloudFrontInventory = () => cached('cf:discover', DISCOVERY_TTL, async () => {
    const list: { id: string; domain: string; aliases: string[]; enabled: boolean }[] = []
    let Marker: string | undefined
    do {
      const res = await cloudFront().send(new ListDistributionsCommand({ Marker }))
      for (const d of res.DistributionList?.Items ?? []) {
        list.push({ id: d.Id!, domain: d.DomainName!, aliases: d.Aliases?.Items ?? [], enabled: d.Enabled ?? false })
      }
      Marker = res.DistributionList?.IsTruncated ? res.DistributionList.NextMarker : undefined
    } while (Marker)
    return list
  })

async function getCloudFront(range: AwsRange): Promise<AwsCloudFrontDist[]> {
  const dists = await cloudFrontInventory()
  return cached(`cf:metrics:${range}`, METRICS_TTL, async () => {
    const { start, end, periodSec } = buildRange(range, Date.now())
    const qs: Q[] = dists.flatMap((d, i) => {
      // CloudFront publishes its metrics only to us-east-1, under Region=Global.
      const dims = { DistributionId: d.id, Region: 'Global' }
      return [
        { id: `r${i}`, metric: 'Requests', stat: 'Sum' },
        { id: `b${i}`, metric: 'BytesDownloaded', stat: 'Sum' },
        { id: `f${i}`, metric: '4xxErrorRate', stat: 'Average' },
        { id: `g${i}`, metric: '5xxErrorRate', stat: 'Average' },
      ].map((m) => ({ ...m, ns: 'AWS/CloudFront', dims }))
    })
    const data = await metricData(GLOBAL_REGION, qs, start, end, periodSec)
    return dists.map((d, i): AwsCloudFrontDist => {
      const req = data.get(`r${i}`) ?? []
      const requests = sum(req)
      // Weight each bucket's rate by its request count so a quiet bucket does not skew the overall rate.
      const weighted = (id: string) => {
        const byT = new Map((data.get(id) ?? []).map((p) => [p.t, p.v]))
        // CloudWatch already reports these rates as percentages, so divide, do not pct() (that was 100x too high).
        return requests > 0 ? req.reduce((a, p) => a + (byT.get(p.t) ?? 0) * p.v, 0) / requests : 0
      }
      const rate4xxPct = weighted(`f${i}`), rate5xxPct = weighted(`g${i}`)
      return {
        ...d, requests, bytesDownloaded: sum(data.get(`b${i}`) ?? []), rate4xxPct, rate5xxPct,
        status: cloudfrontStatus(rate5xxPct, rate4xxPct, requests),
        requestsSeries: req, errors5xxSeries: data.get(`g${i}`) ?? [],
      }
    })
  })
}

// ---------- DynamoDB ----------

export const dynamoInventory = () => cached('ddb:discover', DISCOVERY_TTL, async () => {
    const names: string[] = []
    let ExclusiveStartTableName: string | undefined
    do {
      const res = await dynamo(APP_REGION).send(new ListTablesCommand({ ExclusiveStartTableName }))
      names.push(...(res.TableNames ?? []))
      ExclusiveStartTableName = res.LastEvaluatedTableName
    } while (ExclusiveStartTableName)
    return Promise.all(names.map(async (name) => {
      const t = (await dynamo(APP_REGION).send(new DescribeTableCommand({ TableName: name }))).Table
      return { name, status: t?.TableStatus ?? 'UNKNOWN', itemCount: t?.ItemCount ?? null, sizeBytes: t?.TableSizeBytes ?? null }
    }))
  })

async function getDynamo(range: AwsRange): Promise<AwsDynamoTable[]> {
  const tables = await dynamoInventory()
  return cached(`ddb:metrics:${range}`, METRICS_TTL, async () => {
    const { start, end, periodSec } = buildRange(range, Date.now())
    const qs: Q[] = tables.flatMap((t, i) => {
      const dims = { TableName: t.name }
      // ThrottledRequests needs an Operation dimension; the per-direction throttle events do not,
      // so they are summed instead.
      return [
        { id: `r${i}`, metric: 'ConsumedReadCapacityUnits' },
        { id: `w${i}`, metric: 'ConsumedWriteCapacityUnits' },
        { id: `x${i}`, metric: 'ReadThrottleEvents' },
        { id: `y${i}`, metric: 'WriteThrottleEvents' },
      ].map((m) => ({ ...m, ns: 'AWS/DynamoDB', stat: 'Sum', dims }))
    })
    const data = await metricData(APP_REGION, qs, start, end, periodSec)
    return tables.map((t, i): AwsDynamoTable => {
      const read = data.get(`r${i}`) ?? [], write = data.get(`w${i}`) ?? []
      const throttledRequests = sum(data.get(`x${i}`) ?? []) + sum(data.get(`y${i}`) ?? [])
      return {
        ...t, consumedReadUnits: sum(read), consumedWriteUnits: sum(write), throttledRequests,
        health: dynamoStatus(throttledRequests), readSeries: read, writeSeries: write,
      }
    })
  })
}

// ---------- S3 ----------

export const s3Inventory = () => cached('s3:buckets', DISCOVERY_TTL, async () => {
  const buckets: { name: string; region: string; created: number | null }[] = []
  let ContinuationToken: string | undefined
  do {
    const res = await s3(APP_REGION).send(new ListBucketsCommand({ ContinuationToken }))
    for (const b of res.Buckets ?? []) {
      buckets.push({ name: b.Name!, region: b.BucketRegion ?? APP_REGION, created: b.CreationDate?.getTime() ?? null })
    }
    ContinuationToken = res.ContinuationToken
  } while (ContinuationToken)
  return buckets
})

async function getS3(): Promise<AwsS3Bucket[]> {
  return cached('s3', METRICS_TTL, async () => {
    const buckets = await s3Inventory()

    // Storage metrics are daily and live in each bucket's own region, so use a 2-day window and
    // take the newest point.
    const end = Date.now(), start = end - 2 * 86_400_000
    const regions = [...new Set(buckets.map((b) => b.region))]
    const latest = new Map<string, number>()
    await Promise.all(regions.map(async (region) => {
      const qs: Q[] = buckets.flatMap((b, i) => b.region !== region ? [] : [
        { id: `s${i}`, metric: 'BucketSizeBytes', dims: { BucketName: b.name, StorageType: 'StandardStorage' } },
        { id: `n${i}`, metric: 'NumberOfObjects', dims: { BucketName: b.name, StorageType: 'AllStorageTypes' } },
      ].map((m) => ({ ...m, ns: 'AWS/S3', stat: 'Average' })))
      const data = await metricData(region, qs, start, end, 86_400)
      for (const [id, pts] of data) if (pts.length) latest.set(id, pts[pts.length - 1].v)
    }))
    return buckets.map((b, i): AwsS3Bucket => ({
      name: b.name, sizeBytes: latest.get(`s${i}`) ?? null, objectCount: latest.get(`n${i}`) ?? null,
    }))
  })
}

// ---------- Cost and budget ----------

const accountId = () => cached('sts:account', 24 * 3_600_000, async () => {
  const id = (await sts(APP_REGION).send(new GetCallerIdentityCommand({}))).Account
  if (!id) throw new Error('STS returned no account id')
  return id
})

const ymd = (d: Date) => d.toISOString().slice(0, 10)

async function getBudget(): Promise<AwsBudgetInfo | null> {
  // Budgets calls are free, so this refreshes faster than the Cost Explorer data.
  return cached('budget', METRICS_TTL, async () => {
    const AccountId = await accountId()
    let b
    try {
      b = (await budgets().send(new DescribeBudgetCommand({ AccountId, BudgetName: BUDGET_NAME }))).Budget
    } catch (e) {
      if (e instanceof Error && e.name === 'NotFoundException') return null
      throw e
    }
    if (!b) return null
    const limitUsd = Number(b.BudgetLimit?.Amount ?? 0)
    const actualUsd = Number(b.CalculatedSpend?.ActualSpend?.Amount ?? 0)
    const forecast = b.CalculatedSpend?.ForecastedSpend?.Amount
    const actions = await budgets().send(new DescribeBudgetActionsForBudgetCommand({ AccountId, BudgetName: BUDGET_NAME }))
    const blockActionStatus = actions.Actions?.[0]?.Status ?? null
    const percentUsed = pct(actualUsd, limitUsd)
    return {
      name: BUDGET_NAME, limitUsd, actualUsd, forecastUsd: forecast ? Number(forecast) : null,
      percentUsed, blockActionStatus, status: budgetStatus(percentUsed, blockActionStatus),
    }
  })
}

async function getCostCore(): Promise<Omit<AwsCost, 'budget'>> {
  return cached('cost', COST_TTL, async () => {
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const tomorrow = new Date(now.getTime() + 86_400_000)
    // Cost Explorer works in UTC and treats End as exclusive.
    const res = await costExplorer().send(new GetCostAndUsageCommand({
      TimePeriod: { Start: ymd(monthStart), End: ymd(tomorrow) },
      Granularity: 'DAILY', Metrics: ['UnblendedCost'], GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
    }))
    const services = new Map<string, number>()
    const dailySeries: AwsPoint[] = []
    let monthToDateUsd = 0
    for (const day of res.ResultsByTime ?? []) {
      let dayTotal = 0
      for (const g of day.Groups ?? []) {
        const amt = Number(g.Metrics?.UnblendedCost?.Amount ?? 0)
        dayTotal += amt
        services.set(g.Keys![0], (services.get(g.Keys![0]) ?? 0) + amt)
      }
      monthToDateUsd += dayTotal
      dailySeries.push({ t: Date.parse(`${day.TimePeriod!.Start}T00:00:00Z`), v: round2(dayTotal) })
    }
    const byService = [...services]
      .filter(([, amountUsd]) => amountUsd >= 0.005)
      .map(([service, amountUsd]) => ({ service, amountUsd: round2(amountUsd) }))
      .sort((a, b) => b.amountUsd - a.amountUsd)

    // The forecast throws with too little history and on the last day of the month; that only
    // loses the forecast figure, never the rest of the cost data.
    let forecastUsd: number | null = null
    try {
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      const f = await costExplorer().send(new GetCostForecastCommand({
        TimePeriod: { Start: ymd(now), End: ymd(nextMonth) }, Metric: 'UNBLENDED_COST', Granularity: 'MONTHLY',
      }))
      // The forecast covers today onwards only, so add what is already spent.
      forecastUsd = round2(monthToDateUsd + Number(f.Total?.Amount ?? 0))
    } catch {
      forecastUsd = null
    }
    return { monthToDateUsd: round2(monthToDateUsd), forecastUsd, byService, dailySeries }
  })
}

async function getCost(errors: AwsSectionError[]): Promise<AwsCost> {
  const [core, budget] = await Promise.allSettled([getCostCore(), getBudget()])
  if (core.status === 'rejected') throw core.reason
  if (budget.status === 'rejected') errors.push({ section: 'cost', message: `Budget: ${msg(budget.reason)}` })
  return { ...core.value, budget: budget.status === 'fulfilled' ? budget.value : null }
}

export async function getAwsOverview(range: AwsRange): Promise<AwsMonitorOverview> {
  const errors: AwsSectionError[] = []
  const [lambda, cloudfront, dynamodb, s3r, cost] = await Promise.allSettled([
    getLambda(range), getCloudFront(range), getDynamo(range), getS3(), getCost(errors),
  ])
  const pick = <T,>(r: PromiseSettledResult<T>, section: AwsSectionError['section'], fallback: T): T => {
    if (r.status === 'fulfilled') return r.value
    errors.push({ section, message: msg(r.reason) })
    return fallback
  }
  return {
    range, generatedAt: Date.now(), region: APP_REGION,
    lambda: pick(lambda, 'lambda', []), cloudfront: pick(cloudfront, 'cloudfront', []),
    dynamodb: pick(dynamodb, 'dynamodb', []), s3: pick(s3r, 's3', []), cost: pick(cost, 'cost', null),
    errors,
  }
}
