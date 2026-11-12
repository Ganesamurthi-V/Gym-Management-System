#!/usr/bin/env bash
# Pushes each secret from ../gymflow-admin/.env.local into the admin SST app. Run from infra/ after
# `aws configure`. Create the file with `npx vercel env pull .env.local` inside gymflow-admin/.
set -euo pipefail
ENV_FILE="../gymflow-admin/.env.local"
NAMES=(
  SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY ADMIN_PANEL_SECRET ADMIN_JWT_SECRET
  SENTRY_AUTH_TOKEN RESEND_API_KEY RESEND_WEBHOOK_SECRET
  UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN AI_API_KEY
  FIREBASE_PRIVATE_KEY FIREBASE_CLIENT_EMAIL CRON_SECRET
)
for name in "${NAMES[@]}"; do
  line=$(grep -m1 "^${name}=" "$ENV_FILE" || true)
  if [ -z "$line" ]; then echo "MISSING: $name"; continue; fi
  value="${line#*=}"
  value="${value%$'\r'}"          # Windows line endings
  value="${value%\"}"; value="${value#\"}"
  # FIREBASE_PRIVATE_KEY keeps its literal \n sequences: the value is passed through unchanged.
  npx sst secret set "$name" "$value" --stage production --config sst.admin.config.ts >/dev/null
  echo "set: $name"
done
