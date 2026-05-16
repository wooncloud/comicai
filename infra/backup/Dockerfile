# 백업 컨테이너: pg_dump + MinIO mc + cron(BusyBox).
FROM alpine:3.20

RUN apk add --no-cache postgresql16-client gzip findutils tzdata busybox-suid \
 && wget -q https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc \
 && chmod +x /usr/local/bin/mc

ENV TZ=Asia/Seoul
WORKDIR /app
COPY backup.sh /app/backup.sh
RUN chmod +x /app/backup.sh

# 매일 03:00 KST. BACKUP_SCHEDULE으로 덮어쓸 수 있다.
ENV BACKUP_SCHEDULE="0 3 * * *"

# entrypoint: crontab 작성 후 crond foreground 실행. 환경변수를 cron에 전달하려면 export 후 sh -c.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
