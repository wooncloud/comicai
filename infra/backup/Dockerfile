# 백업 컨테이너: pg_dump + MinIO mc + cron(BusyBox).
FROM alpine:3.20

# curl 은 BACKUP_WEBHOOK_URL 알림용.
# MinIO 바이너리를 받던 공식 주소는 HTTP 410 으로 닫혔고 arm64 호스트에 amd64 바이너리를
# 받던 아키텍처 불일치도 있었다. Alpine 패키지(minio-client)는 빌드 아키텍처를 따라간다.
# 패키지 실행 파일 이름이 /usr/bin/mcli 라 backup.sh 호환을 위해 /usr/local/bin/mc 로 연결한다.
RUN apk add --no-cache postgresql16-client gzip findutils tzdata busybox-suid curl minio-client \
 && ln -s /usr/bin/mcli /usr/local/bin/mc

ENV TZ=Asia/Seoul
WORKDIR /app
COPY backup.sh /app/backup.sh
COPY healthcheck.sh /healthcheck.sh
RUN chmod +x /app/backup.sh /healthcheck.sh

# 매일 03:00 KST. BACKUP_SCHEDULE으로 덮어쓸 수 있다.
ENV BACKUP_SCHEDULE="0 3 * * *"

# entrypoint: crontab 작성 후 crond foreground 실행. 환경변수를 cron에 전달하려면 export 후 sh -c.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# HEALTHCHECK 는 compose 에 있다(`full.yml`). 여기 두면 `start_period` 의 26h 가 이미지에
# 박혀서, `.env` 의 `BACKUP_STALE_HOURS` 를 올려도 유예만 옛 값으로 남는다 — 한 변수가
# 정하는 일을 두 곳이 나눠 갖게 된다.

ENTRYPOINT ["/entrypoint.sh"]
