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

# 컨테이너가 살아 있는 것과 백업이 도는 것은 다르다. last-success 가 낡으면 unhealthy.
# start-period 는 첫 예정 회차(일 1회)를 기다려 주기 위한 것 — 그전까지는 기록이 없다.
HEALTHCHECK --interval=15m --timeout=10s --start-period=26h --retries=2 \
  CMD /healthcheck.sh

ENTRYPOINT ["/entrypoint.sh"]
