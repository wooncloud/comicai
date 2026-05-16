#!/bin/sh
set -eu

# 환경변수를 cron에 전달하기 위한 shell-safe export 파일 생성.
# 값에 공백/특수문자(비밀번호 등)가 들어가도 안전하도록 단일 따옴표로 래핑하고 내부 ' 는 이스케이프.
env | awk -F= '
  /^(POSTGRES_|S3_|MINIO_|BACKUP_)/ {
    key = $1;
    val = substr($0, length(key) + 2);
    gsub(/'\''/, "'\''\\'\'\\\''", val);
    printf "export %s='\''%s'\''\n", key, val;
  }
' > /app/env

cat > /etc/crontabs/root <<EOF
${BACKUP_SCHEDULE} . /app/env; /app/backup.sh >> /proc/1/fd/1 2>&1
EOF

echo "[backup] schedule: ${BACKUP_SCHEDULE}"
echo "[backup] BACKUP_DIR=${BACKUP_DIR:-/backup} retention=${BACKUP_RETENTION_DAYS:-14}d"

if [ "${RUN_ON_START:-0}" = "1" ]; then
  . /app/env
  /app/backup.sh || echo "[backup] initial run failed"
fi

exec crond -f -l 8
