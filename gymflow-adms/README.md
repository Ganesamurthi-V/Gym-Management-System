# gymflow-adms (biometric attendance)

## What this is

GymFlow can take attendance from ZKTeco / eSSL biometric devices. These devices use a protocol called "ADMS push"
(also called iclock). The device sends each punch to a server. That server passes the punch to the GymFlow app.

```
Device  ->  Cloudflare Worker (worker/)  ->  POST /api/devices/punches on the GymFlow app
```

- **Current receiver:** the Cloudflare Worker in `worker/` (Worker name `gymflow-bio`). There is no server to run.
- The Worker calls the app with `Authorization: Bearer <ADMS_INGEST_SECRET>`.
- The app finds the gym from the device serial number. The serial must be registered in GymFlow first.
- **Legacy:** the Fastify server in `src/` and the Worker proxy in `deploy/cloudflare/` are old. Do not deploy them.
  They stay for reference. `tools/simulate-device.ts` still uses `src/`, and the Worker imports `src/parser.ts`, so
  the punch parser lives in one place.

Devices keep punches in memory when the server is unreachable. The receiver answers `OK` only after the app confirms
receipt. If the app fails or times out (10 s), the Worker answers HTTP 503 and the device sends the punches again later.

## What you need

- A Cloudflare account and a domain on Cloudflare for the Worker. Below it is written as `<your-worker-domain>`.
- Node.js and `npm`.
- The app's biometric secret, `ADMS_INGEST_SECRET`. The app must have the same value (see `infra/README.md`).
- The device's serial number, registered in the GymFlow owner console (Biometric page).

## Set up the Worker

1. Open `worker/wrangler.jsonc`. Under `routes`, replace the existing hostnames with `<your-worker-domain>`. Under
   `vars`, set `APP_INGEST_URL` to your app's ingest URL, `https://<your-app-host>/api/devices/punches`.
2. Install and deploy:
   ```
   cd worker
   npm install
   npx wrangler deploy
   ```
   With `custom_domain: true` on a route, Cloudflare creates the proxied DNS record for you.
3. Set the secret (paste the same value the app uses; never commit it):
   ```
   npx wrangler secret put ADMS_INGEST_SECRET
   ```
4. Plain HTTP must stay allowed. In the Cloudflare dashboard, for `<your-worker-domain>` only, turn OFF
   "Always Use HTTPS" and "Automatic HTTPS Rewrites" (Rules, Configuration Rules). Make sure no redirect rule sends
   this host to HTTPS. Older devices speak plain HTTP on port 80 and fail if redirected.
5. Add a WAF rate limit (see "Abuse protection").

### Worker settings

| Name | Where | Default | Notes |
|------|-------|---------|-------|
| `ADMS_INGEST_SECRET` | secret | required | Sent to the app as a bearer token |
| `APP_INGEST_URL` | `wrangler.jsonc` vars | required | The app's `/api/devices/punches` URL. Command relay calls use the same origin |
| `POLL_DELAY_SECONDS` | vars | 60 | Sent to devices as `Delay`. Every poll is a Worker request, so do not lower it without checking the quota |
| `DEVICE_TZ_MINUTES` | vars | 330 | Offset (IST) used to convert epoch punch times and for the clock-drift log. Not sent to the device |
| `DEVICE_TZ_HOURS` | optional | unset | Whole hours from -12 to 14, sent as `TimeZone=<n>`. Not sent when unset or invalid. Unverified on hardware |
| `TRANS_FLAG` | optional | `TransData AttLog` | Older firmware may need the bit-string form, such as `1111000000` |

## Set up the device

1. On the device open: Menu, Comm, Cloud Server Setting.
2. Set the server address to `<your-worker-domain>`.
3. Set the port to `80`. Use `443` if the firmware supports HTTPS (preferred: port 80 sends serial, IDs and times in
   clear text). Turn Domain Name on.
4. Make sure the device's serial number is registered in GymFlow.

## Verify

1. Open `https://<your-worker-domain>/healthz`. It returns an empty 200.
2. Run the local checks: `cd worker && npm test`, `npm run typecheck`, `npx wrangler deploy --dry-run`.
3. To test without a device, run the simulator against your domain from the `gymflow-adms` folder:
   `npm install`, then `npm run simulate -- --url https://<your-worker-domain> --sn <registered-serial> --pins 1,2,3`.
   Options: `--gzip --kv --aspx --poll 5 --interval 8 --rounds 3 --tz-minutes 330`.
4. Punch on the device. The punch should appear in GymFlow. Watch logs with `npx wrangler tail` or Workers Logs in
   the Cloudflare dashboard.

## Troubleshooting

- **Device cannot connect on port 80**: check that "Always Use HTTPS" is off for the host and that no redirect rule
  applies (step 4).
- **Punches do not appear**: confirm the serial is registered. An unregistered serial is remembered for 2 minutes, then
  works shortly after you register it. Confirm `ADMS_INGEST_SECRET` is identical in the Worker and the app.
- **Device keeps resending**: the Worker answers 503 when the app is unreachable or rejects the call. Check
  `APP_INGEST_URL` and the logs for `forward failed`.
- **Log shows `no parsable lines`**: the device uses a format the parser does not know. The log lists field names only.
- **Quota**: see "Poll delay and quota" below.

## Endpoints

All `/iclock/*` routes also work with a `.aspx` suffix. Replies are text/plain.

- `GET /iclock/cdata?SN=` returns device options. `POST /iclock/cdata?SN=&table=ATTLOG` forwards punches (tab-separated
  lines or `key=value` lines, optionally gzip) and replies `OK: <n>`. Other tables reply `OK` and are dropped.
- `GET /iclock/getrequest?SN=` asks the app for pending commands. It is also the device heartbeat.
- `POST /iclock/devicecmd` reports command results. `GET /iclock/ping` and `POST /iclock/fdata` reply `OK`.
- `POST /iclock/registry` and `GET|POST /iclock/push`: Push 3.x, best effort and unverified.
- `GET /healthz` returns 200. Everything else is 404.

The Worker sends punches to the app in chunks of up to 100 (the app accepts up to 500 per request).

## Abuse protection

The endpoint is public and the device serial is the only identity, so abuse and the free-plan quota matter.

- **Negative cache.** When the app answers `known:false`, the Worker remembers that serial for 2 minutes (Cache API)
  and answers without calling the app: config text for GET, plain `OK` for ATTLOG POST and getrequest. A newly
  registered serial therefore starts working within about 2 minutes.
- **Request caps.** A request over 1 MB (declared or streamed) gets an empty 413 or 400. More than 2,000 punches gets
  an empty 400. The parser skips lines over 512 characters.
- **WAF rate limit (set once in the Cloudflare dashboard).** Security, WAF, Rate limiting rules (the free plan allows
  one): hostname equals `<your-worker-domain>`, 30 requests per 10 seconds per IP, action Block for 10 seconds. A gym
  with several devices behind one IP polls only a few times per minute, so this is safe for real devices.
- **Poll delay and quota.** At `POLL_DELAY_SECONDS` 60, one device makes about 1,440 polls a day, plus punches. The free
  plan allows 100,000 Worker requests a day, so plan Workers Paid before roughly 50 devices.
- **Logs** carry only a short SHA-256 tag of the serial, never PINs, bodies, URLs or secrets.

## Command relay

On every `GET /iclock/getrequest` the Worker calls the app's `POST /api/devices/commands/next` (bearer
`ADMS_INGEST_SECRET`, same origin as `APP_INGEST_URL`). It returns the `C:<id>:<command>` lines joined by newlines, or
`OK` when there are none or the app fails. `POST /iclock/devicecmd` parses `ID=<n>&Return=<n>&CMD=...` records
(negative `Return` allowed, max 50) and forwards them to `POST /api/devices/commands/ack` in the background. The device
always gets `OK`.

Safeguards: commands carry ids and are removed only after the device acknowledges them; users are always created with
`Privilege=0`; names are sanitised; `Shell` commands are never used.

## Protocol notes: what is confirmed and what is not

Research of 2026-11-11. ZKTeco does not publish the ADMS/iclock protocol, so formats follow open-source servers tested
on real devices: saifulcoder/adms-server-ZKTeco (tested on an X100-C), athwari/laravel-zkteco-adms-server and
tanemrahman/zkteco-adms. No real captured device traffic was found anywhere, and no device has been tested with
GymFlow.

Confirmed by tested open-source code and consistent across sources:

- ATTLOG is tab separated: PIN, time, status, verify, workcode (extra columns allowed). The reply is `OK: <n>`.
- Commands: `C:<id>:DATA UPDATE USERINFO ...` and `C:<id>:DATA DELETE USERINFO PIN=..` (the full word DELETE; the old
  `USER ADD` / `USER DEL` return -1002).
- The `devicecmd` body is `ID=<id>&Return=<code>&CMD=<name>`, batched one per line. `Return` 0 or more means success.

Unverified, or sources disagree:

- `Privilege` (hardware-tested project) versus `Pri` (other servers and the device's own user output). We default to
  `Privilege` and have an "older devices" switch.
- Handshake key families (`Stamp`/`OpStamp`/`PhotoStamp` versus `ATTLOGStamp`/`OPERLOGStamp`, and `TransFlag` as a bit
  string versus named flags). Ours is a hybrid and unproven.
- The `TimeZone` key. It is opt-in through `DEVICE_TZ_HOURS`.
- A claim that some firmware adds 8 hours from the HTTP `Date` header (single author, no capture).
- A per-request communication key. No evidence any device sends one; do not rely on it.
- Whether each model accepts the handshake and `TransFlag` forms, whether a model sends `pushcommkey`, and which
  firmware sends epoch times or the `key=value` dialect.

Handshake (`GET /iclock/cdata`, `/iclock/push`): `GET OPTION FROM: <SN>`, then `Stamp=9999`, `OpStamp=<unix>`,
`ATTLOGStamp`, `OPERLOGStamp`, `ATTPHOTOStamp`, `ErrorDelay`, `Delay`, `TransTimes`, `TransInterval`, `TransFlag`,
`Realtime`, `Encrypt`. `TimeZone` is sent only when `DEVICE_TZ_HOURS` is set.

ATTLOG lines: tab-separated `PIN, time, status, verify, workcode` (primary), or `key=value` with case-insensitive
aliases (pin/userid/badgenumber, time/datetime/checktime, verifytype/verified/verifymode/verify, status/checktype). A
10-digit Unix epoch time is converted to local time using `DEVICE_TZ_MINUTES`.

## Legacy: Fastify server (`src/`) and Docker + Caddy

Do not use this for new installs. It is kept for reference and for the simulator.

It is a database-less Node + TypeScript server. It listens on plain HTTP and expects Caddy in front for HTTPS.

| Var | Default | Notes |
|-----|---------|-------|
| `APP_INGEST_URL` | required | Full URL of the GymFlow ingest endpoint |
| `ADMS_INGEST_SECRET` | required | Sent as `Authorization: Bearer ...` |
| `PORT` | 8081 | |
| `HOST` | 0.0.0.0 | |
| `DEVICE_TZ_MINUTES` | 330 | Sent to devices as `TimeZone` (330 = IST). The Worker does not do this |
| `LOG_LEVEL` | info | Logs contain serial, counts and status codes only |

It refuses to start without `APP_INGEST_URL` and `ADMS_INGEST_SECRET`. Copy `.env.example` to `.env`; never commit it.

Run locally: `npm install`, then `npm run dev`, `npm test`, `npx tsc --noEmit`.

Docker and Caddy:

```bash
docker build -t gymflow-adms .
docker run -d --name gymflow-adms --restart unless-stopped \
  --env-file .env -p 127.0.0.1:8081:8081 gymflow-adms
```

Install Caddy, copy `deploy/Caddyfile.example` to `/etc/caddy/Caddyfile`, replace `adms.example.com` with your domain
and reload Caddy. It serves plain http on :80 (no redirect, old devices cannot do TLS) and https for the domain, and
proxies only `/iclock*` and `/healthz`. Open only ports 80 and 443 in the firewall. The legacy rate limiter trusts
`X-Forwarded-For`, which is only safe when Node is reachable solely through Caddy.
