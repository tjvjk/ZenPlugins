# MyAmeria Bootloader research version

This is a research build, not a completed synchronization plugin. It refreshes a
manually supplied session, persists rotated authorization immediately, requests
the account/card graph and paginated history, and records masked Bootloader
checkpoints. It deliberately throws after collection instead of returning guessed
financial data or reporting a successful empty import.

## Evidence and limits

Requests initially followed `melontron/ameria-mcp` (`server.js` and `helpers.js`,
inspected 2026-10-07). Token refresh, account acquisition and history acquisition
were verified against an authorized session on 2026-10-07 on the computer and
through Bootloader on Android 14, Zenmoney 26.8.1105. The computer fetched 8
account/card objects and 205 history records across 3 pages for the interval
beginning 2026-07-01. The phone fetched 8 objects and an empty history beginning
2026-10-01; each endpoint returned HTTP 200 and authorization was persisted.
Captures remain under ignored `.local/research/ameriabank-am/` and Bootloader
session storage. No public real-record converter fixtures exist yet.
Financial conversion is intentionally
absent: account/card relationships, own funds versus holds/credit, account-currency
amounts, fees, statuses, stable movement IDs, merchant/purpose boundaries and
internal-transfer links are all unverified. Endpoint time boundaries and token
revocation/recovery also require observation. A subsequent inactive session
returned HTTP 400 with `invalid_grant` / `Session not active`; obtaining a new
browser session restored access. There is no username/password or OTP
login, automatic cold recovery, or production publishing in this version.

## Local setup

Use Node.js 20 and Yarn Classic as required by the repository. Run
`yarn host ameriabank-am` from the repository root. This creates ignored
`src/plugins/ameriabank-am/bootloader_config.json`.

Sign in at https://myameria.am in your browser and inspect your own requests in
DevTools → Network:

- `refreshToken`: `refresh_token` in a successful `token` response.
- `clientAuth`: `Authorization` in that token request, without the `Basic ` prefix.
- `clientId`: `Client-Id` in a request to `ob.myameria.am/api`.

Put these values in the local config's `preferences` object, with `startDate` set
to a recent date, for example `2026-10-01T00:00:00.000+04:00`. Keep real values in
this ignored file; do not send them through chat or commit them. A browser session
and this plugin may compete for a rotated refresh token; obtain a fresh session
if the bank rejects it. Unknown rejections remain reportable errors, not guessed
credential failures.

In Zenmoney, add the **Дзен-мани** connection (Bootloader), enter the computer's
LAN IP, and start synchronization. Phone and computer must be on a network where
port 5050 is reachable. Open http://localhost:5050 on the computer.

Bootloader access must be enabled for the Zenmoney account by the team. In
[the maintainer's instructions](https://github.com/zenmoney/ZenPlugins/pull/715#issuecomment-1931982076),
the account is added to plugin testers before the connection becomes available.
A **Дзен-мани** entry under **Banks without sync** that opens a manual account is
not the Bootloader connection. This access distinction was observed on 26.8.1105.

After a successful refresh, the original preference token can be stale. On the
phone, keep using persisted `data.auth`. For a replacement browser session, update
both local preferences and `data.auth`, enable `bootloader.overrideData` for one
run, then disable it after the phone saves the new authorization. Do not run the
computer check against that same session between phone synchronizations: token
rotation can make the other consumer's saved state stale.

On completion the session contains `myameria-accounts` and
`myameria-history-<page>` checkpoints. The final error containing
`MyAmeria research capture completed` is expected and means data was collected;
no accounts or transactions have been imported. Other errors indicate the stage
still needs investigation. Token state is saved even if collection later fails.

Bootloader's raw network capture and State view can contain secrets, despite
masked plugin-authored logs/checkpoints. Do not share an unredacted session export
or expose the server outside your trusted network. For the next implementation,
preserve complete selected bank objects locally and sanitize public fixtures
under `docs/project/fixtures.md`. Provide account/card graph and representative
expense, income, transfer, hold and FX records, retaining all non-secret fields.
