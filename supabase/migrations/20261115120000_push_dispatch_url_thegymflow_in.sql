-- Point the push dispatch URL at the new admin host. Run this only AFTER admin.thegymflow.in serves the
-- admin app (DNS + certificate live), or push notifications stop reaching the dispatcher.
-- Idempotent: it only rewrites a row that still holds the old host.
UPDATE app_config
   SET value = 'https://admin.thegymflow.in/api/push/dispatch'
 WHERE key = 'push_dispatch_url'
   AND value LIKE 'https://admin.gymflow.sbs/%';
