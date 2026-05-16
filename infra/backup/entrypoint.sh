#!/bin/sh
set -eu

# cron은 환경변수를 상속받지 않으므로 /app/env에 dump 후 cron이 source.
env | grep -E '^(POSTGRES_|S3_|MINIO_|BACKUP_)' > /app/env || true

cat > /etc/crontabs/root <<EOF
${BACKUP_SCHEDULE} . /app/env; /app/backup.sh >> /proc/1/fd/1 2>&1
EOF

echo "[backup] schedule: ${BACKUP_SCHEDULE}"
echo "[backup] BACKUP_DIR=${BACKUP_DIR:-/backup} retention=${BACKUP_RETENTION_DAYS:-14}d"

# RUN_ON_START=1이면 즉시 한 번 실행 후 crond 진입.
if [ "${RUN_ON_START:-0}" = "1" ]; then
  /app/backup.sh || echo "[backup] initial run failed"
fi

exec crond -f -l 8
