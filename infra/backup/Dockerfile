# 백업 컨테이너: pg_dump + MinIO mc + cron(BusyBox).
FROM alpine:3.20

# curl 은 BACKUP_WEBHOOK_URL 알림용.
RUN apk add --no-cache postgresql16-client gzip findutils tzdata busybox-suid curl \
 && wget -q https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc \
 && chmod +x /usr/local/bin/mc

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
