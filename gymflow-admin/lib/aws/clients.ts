import { CloudWatchClient } from '@aws-sdk/client-cloudwatch'
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs'
import { LambdaClient } from '@aws-sdk/client-lambda'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { S3Client } from '@aws-sdk/client-s3'
import { CostExplorerClient } from '@aws-sdk/client-cost-explorer'
import { BudgetsClient } from '@aws-sdk/client-budgets'
import { STSClient } from '@aws-sdk/client-sts'

// Credentials come from the default provider chain: the Lambda execution role in production, the
// local profile or env vars in dev. Nothing is hard-coded.
export const APP_REGION = 'ap-south-1'
// CloudFront metrics, Cost Explorer and Budgets are global services that only exist in us-east-1.
export const GLOBAL_REGION = 'us-east-1'

const instances = new Map<string, unknown>()

// Keyed by an explicit name, not the class name, which a production bundler may minify and collide.
function client<T>(key: string, make: () => T): T {
  let c = instances.get(key) as T | undefined
  if (!c) {
    c = make()
    instances.set(key, c)
  }
  return c
}

export const cloudWatch = (region: string) => client(`cw:${region}`, () => new CloudWatchClient({ region }))
export const cloudWatchLogs = (region: string) => client(`cwl:${region}`, () => new CloudWatchLogsClient({ region }))
export const lambdaClient = (region: string) => client(`lambda:${region}`, () => new LambdaClient({ region }))
export const cloudFront = () => client('cf', () => new CloudFrontClient({ region: GLOBAL_REGION }))
export const dynamo = (region: string) => client(`ddb:${region}`, () => new DynamoDBClient({ region }))
export const s3 = (region: string) => client(`s3:${region}`, () => new S3Client({ region }))
export const costExplorer = () => client('ce', () => new CostExplorerClient({ region: GLOBAL_REGION }))
export const budgets = () => client('budgets', () => new BudgetsClient({ region: GLOBAL_REGION }))
export const sts = (region: string) => client(`sts:${region}`, () => new STSClient({ region }))
