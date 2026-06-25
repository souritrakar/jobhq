#!/usr/bin/env bash
# Smoke-test the jobs CRUD API against a running dev server (npm run dev).
#
# Usage:
#   DEV_USER_ID=<seeded id> ./scripts/smoke-test.sh
# or set DEV_USER_ID in webapp/.env and the dev server picks it up (then the
# x-user-id header below is optional). Requires: curl, jq.
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
USER_ID="${DEV_USER_ID:-}"
HDR=(-H "Content-Type: application/json")
[ -n "$USER_ID" ] && HDR+=(-H "x-user-id: $USER_ID")

echo "▸ health"
curl -s "${HDR[@]}" "$BASE/api/health" | jq .

echo "▸ create"
CREATE=$(curl -s "${HDR[@]}" -X POST "$BASE/api/jobs" \
  -d '{"title":"Smoke Test Engineer","company":"Testium","url":"https://example.com/job","source":"manual"}')
echo "$CREATE" | jq .
ID=$(echo "$CREATE" | jq -r '.data.id')

echo "▸ list"
curl -s "${HDR[@]}" "$BASE/api/jobs" | jq '.data | length as $n | "\($n) jobs"'

echo "▸ get $ID"
curl -s "${HDR[@]}" "$BASE/api/jobs/$ID" | jq '.data | {id, title, status}'

echo "▸ create WITH application (optional questions: short_text, radio/MCQ, number, file)"
CREATE_APP=$(curl -s "${HDR[@]}" -X POST "$BASE/api/jobs" \
  -d '{"title":"Smoke App Engineer","company":"Testium","url":"https://example.com/job-with-app","source":"manual","application":{"questions":[{"label":"Full name","type":"short_text","required":true},{"label":"Are you authorized to work in the US?","type":"radio","options":["Yes","No"],"required":true},{"label":"Years of experience","type":"number"},{"label":"Resume / CV","type":"file","required":true}]}}')
APP_ID=$(echo "$CREATE_APP" | jq -r '.data.id')
echo "$CREATE_APP" | jq '.data.application | {questionCount, schemaVersion, q0_id: .questions[0].id, q0_order: .questions[0].order, q1_type: .questions[1].type, q1_options: .questions[1].options}'

echo "▸ get $APP_ID — application persisted with ids/order"
curl -s "${HDR[@]}" "$BASE/api/jobs/$APP_ID" | jq '.data.application | {questionCount, ids: [.questions[].id]}'

echo "▸ get $ID — NO application (optional, nothing saved)"
curl -s "${HDR[@]}" "$BASE/api/jobs/$ID" | jq '.data | {id, application}'

echo "▸ delete app job $APP_ID"
curl -s "${HDR[@]}" -X DELETE "$BASE/api/jobs/$APP_ID" | jq '.data'

echo "▸ update status -> APPLIED"
curl -s "${HDR[@]}" -X PATCH "$BASE/api/jobs/$ID" -d '{"status":"APPLIED"}' | jq '.data | {id, status}'

echo "▸ delete $ID"
curl -s "${HDR[@]}" -X DELETE "$BASE/api/jobs/$ID" | jq .

echo "✅ smoke test done"
