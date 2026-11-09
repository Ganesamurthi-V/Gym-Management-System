#!/usr/bin/env bash
# Pushes each secret from ../.env.local into SST. Run from infra/ after `aws configure`.
set -euo pipefail
ENV_FILE="../.env.local"
NAMES=(
  SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY CRON_SECRET
  UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN RESEND_API_KEY
  WHATSAPP_VERIFY_TOKEN WHATSAPP_APP_SECRET WHATSAPP_PHONE_NUMBER_ID WHATSAPP_ACCESS_TOKEN
  GRAPH_PROXY_SECRET QSTASH_TOKEN QSTASH_CURRENT_SIGNING_KEY QSTASH_NEXT_SIGNING_KEY
  VAPID_PRIVATE_KEY SENTRY_WEBHOOK_SECRET HEALTH_CHECK_SECRET
  BETTERSTACK_HEARTBEAT_WHATSAPP BETTERSTACK_HEARTBEAT_SUBSCRIPTION
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID
  ADMS_INGEST_SECRET ADMS_INGEST_SECRET_PREVIOUS ADMS_PUBLIC_HOST ADMS_PUBLIC_PORT
)
for name in "${NAMES[@]}"; do
  line=$(grep -m1 "^${name}=" "$ENV_FILE" || true)
  if [ -z "$line" ]; then echo "MISSING: $name"; continue; fi
  value="${line#*=}"
  value="${value%$'\r'}"          # Windows line endings
  value="${value%\"}"; value="${value#\"}"
  npx sst secret set "$name" "$value" --stage production >/dev/null
  echo "set: $name"
done
