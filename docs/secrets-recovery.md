# Secret recovery

Bitwarden Secrets Manager is the source of truth. `ops/secrets-recovery.json` lists exact production consumers and allowlisted runtime variable names. Keep the manifest current when adding a service or credential. Management API tokens and the Bitwarden access token are never installed in the apps.

After rotating/revoking provider credentials and saving replacements in the app's Bitwarden project, run from this repository:

```sh
pnpm secrets:recover          # read-only preflight
pnpm secrets:recover --apply  # install, redeploy existing artifacts, verify running values and health
```

The dependency-free equivalent is `node ops/secrets-recover.mjs --apply`; this avoids a package-manager dependency refresh during an incident.

Prerequisites: authenticated `railway` CLI; `bws` on PATH; a short-lived, read-only `BWS_ACCESS_TOKEN` scoped to this app's Secrets Manager project in the local process environment. Supply it through your password manager or a hidden local prompt; never paste it into chat, command arguments, shell history or a checked-in env file. Unset it after use. Milk & Henny also needs authenticated `cf` CLI access to its email relay Worker; the command pins the account from the manifest. No package dependencies are added.

This command **installs saved replacements**. Provider issuance/revocation still happens at Stripe, Cloudflare and Google. Application passwords, signing keys, cron capabilities and passcodes must likewise have fresh replacements saved before recovery. Review provider access and unexpected charges separately. A provider key cannot safely be “rotated” by changing a local string.

For a database password change, alter the actual database role first using a trusted administrative connection, update the matching Bitwarden URLs/password, reconcile Railway's Postgres service password/URL configuration, and terminate old authenticated sessions when appropriate. The app recovery command deliberately does not perform database role changes or schema/data migrations. A configuration readback alone does not prove the database accepts the replacement.

The command completes all vault/consumer preflights before writes, preserves unrelated variables and schedules, stages variables without automatic deploys, then redeploys the current artifacts. It never uploads the local working tree. It checks the **new** deployment ID, reads runtime SHA-256 digests over authenticated SSH in private memory, and checks the public readiness route. Milk & Henny also checks the worker’s internal readiness endpoint before and after recovery. Values, digests and raw provider errors are never printed or persisted. This is readiness verification; test the relevant payment/upload/OCR/email flow before declaring an incident closed.

A private journal at `~/.local/state/app-secret-recovery/<Railway-project-id>.json` contains only deployment IDs and progress. A pending deployment resumes on the next invocation. If the redeploy response was lost, the command stops instead of creating a duplicate. Inspect Railway and record its resulting deployment ID in the journal, or remove that service entry **only after proving no deployment was created**. A completed journal starts a new recovery on the next invocation. If a deployment fails, fix forward with the replacements; Railway rollback can restore exposed variables. Never use rollback as a credential recovery shortcut.

There is no atomic transaction across Railway and Cloudflare. A failure can leave some consumers updated and others pending; repair the failure and rerun with the same saved replacements. Expect temporary login invalidation, rejected webhook deliveries and unavailable dependent features during cutover. Never generate a second set just because a deploy is queued. Run one recovery process per app at a time. A sibling `.lock` directory enforces this; after a killed process, inspect Railway and the journal before removing that stale lock.

Verify the workflow itself with `pnpm secrets:recover:test`. These tests use fake providers and cover preflight failures, mapping isolation, encryption-root protection, uncertain deploys, runtime mismatch and suppressed subprocess output.

## Signing and durable encryption

`AUTH_SECRET` signs sessions and capabilities. Rotating it invalidates old sessions/links and other AUTH-derived hashes. `DATA_ENCRYPTION_KEY` protects stored transfer deletion tokens, TOTP seeds and MFA recovery-code hashes, CLI response envelopes, recent-login tokens and upload-window tokens. Existing `auth-secret-v1` database identifiers and KDF/AAD labels remain unchanged for compatibility; their names do not select the root secret anymore.

### First cutover: do this in order

1. Before deploying this code, save the **currently effective encryption root bytes** as `DATA_ENCRYPTION_KEY` in this app's Bitwarden project, then install that same value on both Railway web and media-worker. During the October incident the data was already re-encrypted under the replacement AUTH secret; use that replacement, not the exposed historical key.
2. Keep `AUTH_SECRET` unchanged. Deploy the code containing the split to both consumers through the normal source release flow. This recovery command reuses existing artifacts and cannot install new source code. Verify `/api/health` returns `cryptoKeyContract: "separate-v1"` and both consumers run the release. Missing DATA key fails closed; there is no AUTH fallback.
3. Only after that release is live, save a fresh, independent `AUTH_SECRET` in Bitwarden and run `pnpm secrets:recover --apply`. Leave `DATA_ENCRYPTION_KEY` unchanged. Verify TOTP login and an existing transfer deletion capability, plus the relevant provider flows. This signing rotation requires no encrypted-data migration.

Recovery refuses to initialise or replace `DATA_ENCRYPTION_KEY` automatically. It must match installed Railway configuration. Retain an independently recoverable, access-controlled backup of the encryption root; losing it loses decryptability. If that root itself is exposed, rotate it with a verified re-encryption migration. Separating signing and encryption avoids migrations for signing changes; it cannot make compromised encryption material safe to keep.

The manifest coordinates web, the separate media-worker database URL and R2 credentials, and the Cloudflare email relay `EMAIL_EVENT_SECRET`. After recovery check checkout plus webhook fulfillment, public upload/private download, media processing and email-event ingestion. Avoid sending real charges or emails merely as an automated health probe.
