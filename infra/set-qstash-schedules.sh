#!/usr/bin/env bash
# Creates or updates the two daily cron schedules in QStash. Run from infra/ once, and again after any change.
# QStash POSTs to the app on AWS with the x-cron-secret header the cron routes already check, so the routes
# need no change. Upsert is keyed on the schedule id, so re-running never duplicates a schedule.
#
# Reads QSTASH_TOKEN, QSTASH_URL (regional endpoint, blank = EU default) and CRON_SECRET from ../.env.local,
# or from the shell if already exported. Override the target with APP_URL=https://... (default app.gymflow.sbs).
#
# Do not run this while the Vercel crons in vercel.json are still live: WhatsApp automation would run twice.
set -euo pipefail
ENV_FILE="../.env.local"

read_env() {
  local name="$1" line value
  value="${!name:-}"
  if [ -z "$value" ] && [ -f "$ENV_FILE" ]; then
    line=$(grep -m1 "^${name}=" "$ENV_FILE" || true)
    value="${line#*=}"
    value="${value%$'\r'}"; value="${value%\"}"; value="${value#\"}"
  fi
  printf '%s' "$value"
}

QSTASH_TOKEN=$(read_env QSTASH_TOKEN)
QSTASH_URL=$(read_env QSTASH_URL)
CRON_SECRET=$(read_env CRON_SECRET)
APP_URL="${APP_URL:-https://app.gymflow.sbs}"
BASE="${QSTASH_URL:-https://qstash.upstash.io}"; BASE="${BASE%/}"

for n in QSTASH_TOKEN CRON_SECRET; do
  if [ -z "${!n}" ]; then echo "MISSING: $n"; exit 1; fi
done

# id | path | cron in UTC (same times as the old vercel.json crons)
SCHEDULES=(
  "gymflow-cron-whatsapp|/api/cron/whatsapp|30 3 * * *"       # 09:00 IST
  "gymflow-cron-subscription|/api/cron/subscription|0 0 * * *" # 05:30 IST
  "gymflow-cron-push-evening|/api/cron/push-evening|30 13 * * *" # 19:00 IST
)

for entry in "${SCHEDULES[@]}"; do
  IFS='|' read -r id path cron <<<"$entry"
  # Retries 0: a failed run surfaces through the Better Stack heartbeat instead of re-running the automation.
  status=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/v2/schedules/${APP_URL}${path}" \
    -H "Authorization: Bearer ${QSTASH_TOKEN}" \
    -H "Upstash-Schedule-Id: ${id}" \
    -H "Upstash-Cron: CRON_TZ=UTC ${cron}" \
    -H "Upstash-Method: POST" \
    -H "Upstash-Retries: 0" \
    -H "Upstash-Forward-x-cron-secret: ${CRON_SECRET}")
  case "$status" in
    200|201) echo "ok: ${id} -> ${APP_URL}${path} (${cron} UTC)" ;;
    *) echo "FAILED: ${id} (HTTP ${status}); check QSTASH_TOKEN and QSTASH_URL region"; exit 1 ;;
  esac
done
