#!/usr/bin/env bash
# Dump production Postgres and upload it to the private R2 bucket `milkandhenny-backups`.
#
# Writes, for one UTC timestamp:
#   postgres/milkandhenny-postgres-<ts>.dump             pg_dump -Fc of the whole database
#   postgres/milkandhenny-postgres-<ts>.dump.list        pg_restore --list of that dump
#   postgres/milkandhenny-postgres-<ts>.row-counts.txt   exact row count per table, same snapshot
#   postgres/milkandhenny-postgres-<ts>.SHA256SUMS       checksums of the three files above
# On the 1st of the month the same four files also go under monthly/postgres/.
#
# Env: DATABASE_URL, BACKUP_DROP_URL, BACKUP_DROP_TOKEN.
# `backup.sh --no-upload <dir>` writes the files into <dir> instead of uploading them.
# Any failure exits non-zero, which Railway shows as a failed cron run.
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
output_dir=""
if [[ "${1:-}" == "--no-upload" ]]; then
  output_dir="${2:?--no-upload needs an output directory}"
else
  : "${BACKUP_DROP_URL:?BACKUP_DROP_URL is required}"
  : "${BACKUP_DROP_TOKEN:?BACKUP_DROP_TOKEN is required}"
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="milkandhenny-postgres-${stamp}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"

log() { printf '{"event":"postgres.backup.%s","backup":"%s"%s}\n' "$1" "$name" "${2:-}"; }
log start

# Hold one repeatable-read transaction open, dump from its snapshot, then count rows in that same
# snapshot, so the row counts describe exactly what is in the dump.
coproc PSQL { psql -X -q -At -v ON_ERROR_STOP=1 -d "$DATABASE_URL"; }
# Bash unsets PSQL once psql exits, so keep our own copies of its pipes and pid.
psql_pid="$PSQL_PID"
exec {to_psql}>&"${PSQL[1]}" {from_psql}<&"${PSQL[0]}"
printf '%s\n' "begin isolation level repeatable read read only;" "select pg_export_snapshot();" \
  >&"$to_psql"
read -r snapshot <&"$from_psql"

pg_dump -Fc --snapshot="$snapshot" -d "$DATABASE_URL" -f "${name}.dump"

cat >&"$to_psql" <<'SQL'
select format('%s.%s', table_schema, table_name) || E'\t' ||
  (xpath('/row/c/text()', query_to_xml(
    format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables
where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
order by 1;
\echo __end__
commit;
\q
SQL
: >"${name}.row-counts.txt"
while read -r line <&"$from_psql"; do
  [[ "$line" == "__end__" ]] && break
  printf '%s\n' "$line" >>"${name}.row-counts.txt"
done
exec {to_psql}>&-
wait "$psql_pid"

tables="$(wc -l <"${name}.row-counts.txt" | tr -d ' ')"
rows="$(awk -F '\t' '{ total += $2 } END { print total + 0 }' "${name}.row-counts.txt")"
if [[ "$tables" -eq 0 ]]; then
  echo "row counts are empty; refusing to publish this backup" >&2
  exit 1
fi

pg_restore --list "${name}.dump" >"${name}.dump.list"
sha256sum "${name}.dump" "${name}.dump.list" "${name}.row-counts.txt" >"${name}.SHA256SUMS"
dump_sha="$(awk 'NR == 1 { print $1 }' "${name}.SHA256SUMS")"
dump_bytes="$(wc -c <"${name}.dump" | tr -d ' ')"
log dumped ",\"tables\":${tables},\"rows\":${rows},\"bytes\":${dump_bytes},\"sha256\":\"${dump_sha}\""

if [[ -n "$output_dir" ]]; then
  cp "${name}".* "$output_dir"/
  log saved ",\"dir\":\"${output_dir}\""
  exit 0
fi

prefixes=(postgres)
[[ "$(date -u +%d)" == "01" ]] && prefixes+=(monthly/postgres)

upload() {
  local key="$1/$2"
  curl --silent --show-error --fail-with-body --retry 3 --retry-all-errors --max-time 600 \
    -X PUT --upload-file "$2" \
    -H @<(printf 'authorization: Bearer %s\n' "$BACKUP_DROP_TOKEN") \
    -H "x-content-sha256: $(sha256sum "$2" | awk '{ print $1 }')" \
    "${BACKUP_DROP_URL%/}/${key}" >/dev/null
}

for prefix in "${prefixes[@]}"; do
  # SHA256SUMS goes last: its presence means the set is complete.
  for file in "${name}.dump" "${name}.dump.list" "${name}.row-counts.txt" "${name}.SHA256SUMS"; do
    upload "$prefix" "$file"
  done
  log uploaded ",\"prefix\":\"${prefix}/\""
done
log complete
