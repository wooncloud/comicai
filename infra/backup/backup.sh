#!/bin/sh
# Postgres pg_dump + MinIO mc mirror.
# 환경변수:
#   POSTGRES_HOST POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
#   S3_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY S3_BUCKET
#   BACKUP_DIR (default /backup)
#   BACKUP_RETENTION_DAYS (default 14)
set -euo pipefail

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_USER:=comicai}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:=comicai}"
: "${S3_ENDPOINT:=http://minio:9000}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY is required}"
: "${S3_BUCKET:=comicai}"
: "${BACKUP_DIR:=/backup}"
: "${BACKUP_RETENTION_DAYS:=14}"

ts=$(date -u +"%Y%m%dT%H%M%SZ")
pg_out="${BACKUP_DIR}/postgres/${POSTGRES_DB}-${ts}.sql.gz"
mkdir -p "${BACKUP_DIR}/postgres"

echo "[backup ${ts}] pg_dump → ${pg_out}"
PGPASSWORD="${POSTGRES_PASSWORD}" \
  pg_dump -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
    --format=plain --no-owner --no-acl \
  | gzip -9 > "${pg_out}"

echo "[backup ${ts}] mc alias set + mirror"
mc alias set src "${S3_ENDPOINT}" "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}" >/dev/null
mc mirror --overwrite --remove "src/${S3_BUCKET}" "${BACKUP_DIR}/minio/${S3_BUCKET}"

echo "[backup ${ts}] cleanup older than ${BACKUP_RETENTION_DAYS}d"
find "${BACKUP_DIR}/postgres" -name "*.sql.gz" -mtime "+${BACKUP_RETENTION_DAYS}" -delete

echo "[backup ${ts}] done"
