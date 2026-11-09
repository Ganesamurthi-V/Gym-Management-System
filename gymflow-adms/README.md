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
APP_INGEST_URL=http://localhost:9000/ingest ADMS_INGEST_SECRET=dev-secret npm run dev
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
