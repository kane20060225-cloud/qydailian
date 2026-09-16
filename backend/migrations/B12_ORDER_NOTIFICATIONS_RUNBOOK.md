# Order notifications

Back up the production site and database. Run `node scripts/migrate-b12-order-notifications.js --plan`, then
`node scripts/migrate-b12-order-notifications.js --apply --confirm=B12-ORDER-NOTIFICATIONS-ADDITIVE-MIGRATION`.
This adds six metadata tables; it never fans out historical orders or sends messages during migration.

Hall dispatch writes eligible booster notifications and delivery jobs in the dispatch transaction. Identity rank and user preferences filter recipients. Taking an order locks and conditionally updates the paid, available source row, so exactly one booster succeeds. Customer payment/completion notifications and legacy inbox messages use the same business transaction. Repeated delivery uses the same notification ID and content; the WeCom API duplicate checker is enabled. Jobs retry with capped exponential backoff, up to five attempts. A 2-minute lease recovers interrupted workers. Stale orders, role changes, disabled preferences and unbound users are checked before sending. Delivery is polled every five seconds; external API failure never rolls back a committed order. Secret-bearing URLs and upstream raw errors are never logged.

Realtime uses a fetch SSE connection with an Authorization header, never a JWT in a URL. Nginx buffering is disabled per response by `X-Accel-Buffering: no`; heartbeat snapshots every 15 seconds provide catch-up after reconnection and cross-process updates. Reads and unread counts are user-scoped. Session version is checked every snapshot; logout aborts the client connection. Sound is opt-in and requires a browser interaction.

## Enterprise setup (user already has a company)

1. In the WeCom admin console create an internal custom application. Add the actual boosters to the app's visible scope and ensure they have joined the same enterprise.
2. Website **Settings → Notifications** (admin): fill CorpID, AgentID, Secret and the admin website password. Secret is encrypted using the existing field-encryption key and is not returned in API responses.
3. Configure the app's OAuth trusted domain as `wotbqydailian.vip`; follow the platform's domain verification-file requirement. OAuth callback: `https://wotbqydailian.vip/api/notifications/wecom/callback`. Set corporate trusted IP to the actual server egress IP (current deployment server 59.110.150.192; verify egress when configuring).
4. Boosters log into the website in WeCom and bind their own account. Other browsers can generate a 10-minute one-use link to open in WeCom. The callback resolves the WeCom member identity server-side; state is tied to the website session version and enterprise/application. A member identity cannot bind to two website users.
5. Use **Verify connection** (token only, no message). Enable sending. Create a genuine reviewed order and explicitly dispatch it to validate end-to-end delivery. This deployment does not fabricate orders or send tests to real members.

Sending does not require enabling an inbound messaging webhook. Order links open the website and require login and a normal server-side take action; they do not auto-claim orders or expose account/password/customer contact details. Config changes to CorpID/AgentID invalidate old bindings; bind again afterward.

References: [WeCom official API library](https://github.com/sbzhu/weworkapi_python/blob/master/api/src/CorpApi.py),
[send app messages](https://developer.work.weixin.qq.com/document/path/90236),
[OAuth URL](https://developer.work.weixin.qq.com/document/path/91022),
[resolve member identity](https://developer.work.weixin.qq.com/document/path/91023).

Rollback: stop/restart the worker using the previous application backup; leave the additive tables in place. Disable enterprise sending before rolling back when configured. Existing order balances/ledgers and the 14-day trash policy are unaffected by this migration.
