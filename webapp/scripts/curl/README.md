# Manual verification (curl)

Quick scripts to exercise the reminders/notifications API against a local dev server.

```bash
BASE=http://localhost:3000 ./scripts/curl/reminders.sh
```

The dev auth seam falls back to `DEV_USER_ID` when no `x-user-id` header is sent, so these work
without auth locally.

## QStash in local dev

QStash cannot reach a bare `localhost`, so scheduled deliveries + the digest cron do not fire
against a plain `npm run dev`. To exercise them end to end, run the Upstash QStash dev server:

```bash
npx @upstash/qstash-cli dev
```

It prints a `QSTASH_URL`, `QSTASH_TOKEN`, and the two signing keys. Put them in `.env`, restart the
dev server, and reminders created with a near-future `dueAt` will call back to `/api/reminders/fire`
on time. In production set the real `QSTASH_*` vars and run `npm run qstash:setup` once (after
`APP_URL` is publicly reachable) to register the daily digest cron.
