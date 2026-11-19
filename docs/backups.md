# Database backups

Production Postgres is dumped every night to a private R2 bucket on Owen's personal Cloudflare
account. This page says where the dumps are, how long they are kept, how to check the nightly job
ran, and how to restore one.

## Where they live

| Piece        | Where                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bucket       | R2 `milkandhenny-backups`, account `Owen Personal` (`d88459b45dfbe1ccc64136eac246387c`), location WEUR. No `r2.dev` URL and no custom domain. R2 encrypts objects at rest; there is no extra layer. |
| Nightly job  | Railway project `milkandhenny`, environment `production`, cron service `postgres-backup`, daily at 03:15 UTC. Code in [`backup/`](../backup/).                                                      |
| Upload route | Cloudflare Worker `milkandhenny-backup-drop` ([`backup/r2-drop/`](../backup/r2-drop/)), bound to the bucket.                                                                                        |

Each run writes four objects under `postgres/`, all named for one UTC timestamp:

| Object                                      | What it is                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `milkandhenny-postgres-<ts>.dump`           | `pg_dump -Fc` of the whole `railway` database, Postgres 18 client           |
| `milkandhenny-postgres-<ts>.dump.list`      | `pg_restore --list` of the dump                                             |
| `milkandhenny-postgres-<ts>.row-counts.txt` | Exact row count per table, taken in the same snapshot as the dump           |
| `milkandhenny-postgres-<ts>.SHA256SUMS`     | SHA-256 of the three files above; uploaded last, so it marks a complete set |

On the 1st of each month the same four objects are also written under `monthly/postgres/`.

The dumps hold guest personal data. Download one only to restore or drill, and delete local copies
afterwards.

## Retention

The bucket lifecycle is versioned in [`backup/r2-lifecycle.json`](../backup/r2-lifecycle.json):

- `postgres/`: deleted after 35 days, so about five weeks of nightly dumps;
- `monthly/`: deleted after 365 days, so the last twelve monthly dumps;
- incomplete multipart uploads: aborted after one day.

Apply a change with the `cf` CLI:

```sh
export CLOUDFLARE_ACCOUNT_ID=d88459b45dfbe1ccc64136eac246387c
cf r2 buckets lifecycle update milkandhenny-backups --body @backup/r2-lifecycle.json --force --profile personal-deploy
```

## How the nightly job works

[`backup/backup.sh`](../backup/backup.sh) runs in a `postgres:18-alpine` image. It opens one
repeatable-read transaction, runs `pg_dump --snapshot` from it, counts every table in the same
snapshot, writes the `.list` and `SHA256SUMS`, and uploads the four files. It reaches Postgres over
Railway's private network through the reference variable `DATABASE_URL=${{Postgres.DATABASE_URL}}`.

Uploads go through the `milkandhenny-backup-drop` Worker rather than an R2 API key. The Railway
service holds only `BACKUP_DROP_TOKEN`, which can create new objects with the backup name pattern
and nothing else: it cannot read, list, overwrite or delete. Each upload sends the file's SHA-256,
and R2 rejects the write if the bytes it received do not match. The same token value is the Worker
secret `BACKUP_DROP_TOKEN`; it exists nowhere else.

| Railway variable on `postgres-backup` | Value                                                          |
| ------------------------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`                        | `${{Postgres.DATABASE_URL}}` (reference, private network)      |
| `BACKUP_DROP_URL`                     | `https://milkandhenny-backup-drop.owen-personal.workers.dev`   |
| `BACKUP_DROP_TOKEN`                   | Generated; shared only with the Worker secret of the same name |

## Checking that it ran

Any failure exits non-zero, and Railway marks that run of `postgres-backup` as **Crashed**, the same
state it raises crash notifications for. A good run ends with this log line:

```text
{"event":"postgres.backup.complete","backup":"milkandhenny-postgres-<ts>"}
```

From a terminal:

```sh
railway logs --service postgres-backup --environment production
```

To see the newest objects:

```sh
cf r2 objects list --bucket-name milkandhenny-backups --prefix postgres/ --profile personal-deploy
```

To run it now, use **Run now** on the cron service in the Railway dashboard.

## Restore

Use a Postgres 18 client. Download one set and check it:

```sh
export CLOUDFLARE_ACCOUNT_ID=d88459b45dfbe1ccc64136eac246387c
name=milkandhenny-postgres-<ts>
mkdir -m 700 restore && cd restore
for ext in dump dump.list row-counts.txt SHA256SUMS; do
  cf r2 objects get "postgres/$name.$ext" --bucket-name milkandhenny-backups --profile personal-deploy > "$name.$ext"
done
shasum -a 256 -c "$name.SHA256SUMS"
```

The Cloudflare dashboard (R2 → `milkandhenny-backups`) can download the objects too.

Restore into a new, empty database. Never restore over the live one:

```sh
pg_restore --no-owner --no-acl --exit-on-error -d "$TARGET_DATABASE_URL" "$name.dump"
```

`--no-owner --no-acl` suits a drill or a fresh host. For a replacement production database that
keeps the [runtime roles](./postgres-runtime-roles.md), create those roles first and restore without
the two flags so their grants come back.

Then compare `select count(*)` for each table against `$name.row-counts.txt`; every line should
match. Continue with the checks and restore order in [disaster recovery](./disaster-recovery.md).
Delete the downloaded files when done.

## Changing the job or the Worker

The job is deployed from this repository by CLI upload, not by GitHub, so a merge does not change
it. After editing `backup/`:

```sh
cd backup
railway up . --path-as-root --service postgres-backup --environment production --detach
```

The service's cron schedule (`15 3 * * *`) and restart policy (`NEVER`) are Railway service
settings, not files.

After editing the Worker:

```sh
cd backup/r2-drop
pnpm install --frozen-lockfile
CLOUDFLARE_ACCOUNT_ID=d88459b45dfbe1ccc64136eac246387c pnpm exec cf deploy --profile personal-deploy
```

To rotate the token, generate one value and pipe it to both holders, without printing it:

```sh
token="$(openssl rand -hex 32)"
printf '%s' "$token" | cf workers secrets update BACKUP_DROP_TOKEN --script-name milkandhenny-backup-drop --body @/dev/stdin --profile personal-deploy
printf '%s' "$token" | railway variable set BACKUP_DROP_TOKEN --stdin --service postgres-backup --environment production
unset token
```

## History

- 19 November 2026: first off-machine backup, `postgres/milkandhenny-postgres-20261119T005459Z.*`,
  taken from this job's image on a Mac. It was downloaded back from R2, passed `shasum -c`, restored
  into a clean `postgres:18` container with `--exit-on-error`, and matched production in all 161
  tables (5,789 rows).
