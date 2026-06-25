#!/usr/bin/env bash
# Exercise the reminders + notifications API locally. Override BASE to point elsewhere.
#   BASE=http://localhost:3000 ./scripts/curl/reminders.sh
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
H=(-H "Content-Type: application/json")

echo "# all reminders"
curl -s "${H[@]}" "$BASE/api/reminders" ; echo

echo "# upcoming reminders (next 30 days) — what the extension alarm sync reads"
curl -s "${H[@]}" "$BASE/api/reminders?upcoming=1&days=30" ; echo

echo "# create a standalone reminder due in ~1 minute"
DUE="$(date -u -d '+1 minute' +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -v+1M +%Y-%m-%dT%H:%M:%S.000Z)"
curl -s "${H[@]}" -X POST "$BASE/api/reminders" \
  -d "{\"title\":\"Test reminder\",\"dueAt\":\"$DUE\",\"hasTime\":true}" ; echo

echo "# in-app notifications (a fired reminder shows up here)"
curl -s "${H[@]}" "$BASE/api/notifications" ; echo

# Note: firing requires QStash to reach this origin (see README.md). The /api/reminders/fire and
# /api/cron/reminders-digest routes reject unsigned requests, so they cannot be curled directly.
