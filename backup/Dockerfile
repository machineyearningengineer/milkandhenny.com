# Nightly Postgres backup job, run by the Railway `postgres-backup` cron service.
# The client major version must match production Postgres (18).
FROM postgres:18-alpine
RUN apk add --no-cache bash curl
COPY backup.sh /usr/local/bin/backup.sh
USER postgres
ENTRYPOINT ["/usr/local/bin/backup.sh"]
