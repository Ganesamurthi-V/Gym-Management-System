# gymflow-adms

A small, database-less Node + TypeScript server that speaks the ZKTeco / eSSL "ADMS push" (iclock) protocol to
biometric attendance devices and forwards normalized punches to the GymFlow app. It runs on a VPS behind Caddy
(Caddy handles HTTPS, Node listens on plain HTTP), so devices can use either http or https.

Devices buffer punches offline. The server never answers `OK` until the app has confirmed receipt; on any app
failure or a 10 s timeout it answers HTTP 503 and the device re-sends later.

## Environment

| Var | Default | Notes |
|-----|---------|-------|
| `APP_INGEST_URL` | required | Full URL of the GymFlow ingest endpoint |
| `ADMS_INGEST_SECRET` | required | Sent as `Authorization: Bearer ...` |
| `PORT` | 8081 | |
| `HOST` | 0.0.0.0 | |
| `DEVICE_TZ_MINUTES` | 330 | Sent to devices as `TimeZone` (330 = IST) |
| `LOG_LEVEL` | info | Logs contain serial, counts and status codes only |

The server refuses to start without `APP_INGEST_URL` and `ADMS_INGEST_SECRET`. Copy `.env.example` and fill it in;
never commit `.env`.

## Run locally

```bash
npm install
# Put APP_INGEST_URL and a throwaway ADMS_INGEST_SECRET in .env first (see .env.example), then:
npm run dev
npm test
npx tsc --noEmit
```

## Simulate a device

```bash
npm run simulate -- --url http://localhost:8081 --sn TEST123 --pins 1,2,3
# options: --gzip --kv --aspx --poll 5 --interval 8 --rounds 3 --tz-minutes 330
```

The simulator fetches options, polls `getrequest`, posts CRLF ATTLOG batches, and keeps unsent punches in memory,
retrying when the server answers non-OK or 5xx.

## Endpoints

All `/iclock/*` routes also work with a `.aspx` suffix. Responses are text/plain.

- `GET /iclock/cdata?SN=` returns device options. `POST /iclock/cdata?SN=&table=ATTLOG` forwards punches
  (classic tab lines or `key=value` lines, optionally gzip) and replies `OK:<n>`. Other tables reply `OK` and are dropped.
- `GET /iclock/getrequest?SN=` sends a heartbeat to the app (at most once per 60 s per serial).
- `POST /iclock/devicecmd`, `GET /iclock/ping` reply `OK`.
- `POST /iclock/registry`, `GET|POST /iclock/push`: Push 3.x, best effort and unverified.
- `GET /healthz` returns 200. Everything else is 404.

Forwarded body: `{ "serial": "...", "punches": [{ "pin", "time", "status", "verify" }] }`, max 500 per request.

## Deploy (Docker + Caddy)

```bash
docker build -t gymflow-adms .
docker run -d --name gymflow-adms --restart unless-stopped \
  --env-file .env -p 127.0.0.1:8081:8081 gymflow-adms
```

Install Caddy on the host, copy `deploy/Caddyfile.example` to `/etc/caddy/Caddyfile`, replace `adms.example.com`
with your domain, and reload Caddy. It serves plain http on :80 (no redirect, old devices cannot do TLS) and https
for the domain, proxying only `/iclock*` and `/healthz`.

Firewall: open only 80 and 443. Keep 8081 closed to the outside (bound to 127.0.0.1 above). The rate limiter trusts
`X-Forwarded-For`, which is only safe when Node is reachable solely through Caddy.

## Device setup

On the device: Menu > Comm > Cloud Server Setting. Set the server address to your domain (for example
`adms.example.com`) and the port to 80 (http) or 443 (https, if the firmware supports it). Enable the proxy/HTTPS
options only if your firmware needs them. Then register the device's serial number in GymFlow.

## Notes

Config keys come from the ZKTeco PUSH SDK and vary by firmware. The Push 3.x endpoints are best effort and
unverified against real hardware.

## Public hostname (bio.gymflow.sbs): the Cloudflare Worker

`worker/` is the production receiver: one Cloudflare Worker (`gymflow-bio`) that speaks the same ADMS protocol as the
Fastify app and forwards punches straight to the GymFlow app. There is no server to run. The Fastify server in `src/`
and the proxy in `deploy/cloudflare/` are **legacy**; they are kept for reference and for `tools/simulate-device.ts`.
The Worker imports `src/parser.ts`, so the punch parser stays in one place.

1. `cd worker && npm install && npx wrangler deploy` (creates the proxied DNS record for the hostname).
2. `npx wrangler secret put ADMS_INGEST_SECRET` and paste the same secret the app uses. Never commit it.
3. Vars live in `worker/wrangler.jsonc`: `APP_INGEST_URL`, `POLL_DELAY_SECONDS` (device poll interval, default 60; every
   poll is a Worker request, so do not lower it without checking the quota) and `DEVICE_TZ_MINUTES` (default 330).
4. In the Cloudflare dashboard, for `bio.gymflow.sbs` only, turn OFF "Always Use HTTPS" and "Automatic HTTPS
   Rewrites" (Rules > Configuration Rules). Older devices speak plain HTTP on port 80 and would otherwise be
   redirected to HTTPS and fail. Also make sure no redirect rule sends `bio.gymflow.sbs` to HTTPS.
5. Devices: Server address `bio.gymflow.sbs`, port `80` (or `443` with HTTPS enabled on the device), Domain Name on.

### Abuse protection

The endpoint is public and the device serial is the only identity, so abuse and the free-plan quota are the concern.

- **Negative cache.** When the app answers `known:false`, the Worker remembers that serial for 2 minutes (Cache API)
  and answers it without calling the app: config text for GET, plain `OK` for ATTLOG POST and getrequest. A newly
  registered serial therefore starts working within about 2 minutes.
- **Request caps.** A request over 1 MB (declared or streamed) or with more than 2,000 punches gets an empty 400/413;
  punches reach the app in chunks of 100. Lines over 512 characters are skipped by the parser.
- **WAF rate limit (set once in the Cloudflare dashboard).** Security > WAF > Rate limiting rules (the free plan allows
  one): hostname equals `bio.gymflow.sbs`, 30 requests per 10 seconds per IP, action Block for 10 seconds. A gym with
  several devices behind one IP polls only a few times per minute, so this is safe for real devices.
- **Poll delay and quota.** `POLL_DELAY_SECONDS` is 60, about 1,440 polls per day per device plus punches. The free
  plan allows 100,000 Worker requests per day, so plan Workers Paid before roughly 50 devices.
- **Use HTTPS where the firmware supports it.** Port 80 sends the serial, IDs and times in clear text; use port 443.
- Logs carry only a short SHA-256 tag of the serial, never PINs, bodies, URLs or secrets.

Checks: `cd worker && npm test`, `npm run typecheck`, `npx wrangler deploy --dry-run`. To exercise a deployed Worker, run
the simulator against `bio.gymflow.sbs`.

## Cloudflare Worker (bio.gymflow.sbs)

The live receiver is `worker/` (Worker `gymflow-bio`); the Node server above is the legacy implementation. Both share
`src/parser.ts`.

### What is confirmed and what is not (research of 2026-11-11)

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
- The `TimeZone` key. It is now opt-in through `DEVICE_TZ_HOURS`.
- A claim that some firmware adds 8 hours from the HTTP `Date` header (single author, no capture).
- A per-request communication key. No evidence any device sends one; do not rely on it.
- No real captured device traffic was found anywhere.

### Supported formats and sources

ZKTeco does not publish the ADMS/iclock protocol. Formats follow open-source servers confirmed on real devices:
saifulcoder/adms-server-ZKTeco (tested on an X100-C), athwari/laravel-zkteco-adms-server and
tanemrahman/zkteco-adms.

- Handshake (`GET /iclock/cdata`, `/iclock/push`): `GET OPTION FROM: <SN>` then `Stamp=9999`, `OpStamp=<unix>`,
  `ATTLOGStamp`, `OPERLOGStamp`, `ATTPHOTOStamp`, `ErrorDelay`, `Delay`, `TransTimes`, `TransInterval`, `TransFlag`,
  `Realtime`, `Encrypt`. `TimeZone` is sent only when `DEVICE_TZ_HOURS` is set.
- ATTLOG lines: tab-separated `PIN, time, status, verify, workcode` (primary), or `key=value` with
  case-insensitive aliases (pin/userid/badgenumber, time/datetime/checktime, verifytype/verified/verifymode/verify,
  status/checktype). A 10-digit Unix epoch time is converted to local time using `DEVICE_TZ_MINUTES`.
- Reply to ATTLOG is `OK: <n>`; everything else (other tables, `/iclock/fdata`) is `OK`, body unread.
- A non-blank ATTLOG body where no line parses logs one `no parsable lines` warning with field names only.
  Requests to `cdata`/`getrequest` log the query parameter names (never values) to show what a new model sends.

### Environment overrides

| Var | Default | Notes |
|-----|---------|-------|
| `POLL_DELAY_SECONDS` | 60 | Sent as `Delay` |
| `DEVICE_TZ_MINUTES` | 330 | Offset for converting epoch punch times and for the clock-drift log; not sent to the device |
| `DEVICE_TZ_HOURS` | unset | Opt-in. Whole hours -12 to 14 sent as `TimeZone=<n>`; no line when unset or invalid. Unverified on hardware |
| `TRANS_FLAG` | `TransData AttLog` | Older firmware may need the bit-string form such as `1111000000` |

### Command relay

`GET /iclock/getrequest` calls the app's `POST /api/devices/commands/next` (bearer `ADMS_INGEST_SECRET`, same origin
as `APP_INGEST_URL`) on every poll, which also serves as the heartbeat, and returns the `C:<id>:<command>` lines
joined by newlines, or `OK` when there are none or the app fails. `POST /iclock/devicecmd` parses
`ID=<n>&Return=<n>&CMD=...` records (negative `Return` allowed, max 50) and forwards them to
`POST /api/devices/commands/ack` in the background; the device always gets `OK`.

Phase 2 safeguards: commands carry ids and are removed only after the device acknowledges them; users are always
created with `Privilege=0`; names are sanitised; `Shell` commands are never used.

### Unverified on real hardware

No device has been tested. Unverified: whether each model accepts the handshake and `TransFlag` forms, the command
field names (`Privilege` vs `Pri`), whether a model sends `pushcommkey`, and which firmware sends epoch times or
the key=value dialect.
