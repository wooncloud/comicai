-- 컷의 앞뒤 순서를 저장한다.
--
-- 없을 때는 `panel.findMany({ where: { pageId } })` 에 orderBy 가 아예 없어서
-- Postgres 힙 순서가 그대로 나갔고, 그 순서는 UPDATE 마다 바뀔 수 있었다.
-- 겹쳐 둔 컷이 사용자가 아무것도 하지 않았는데 새로고침마다 앞뒤가 뒤바뀌었다.

ALTER TABLE "panels" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

-- 기존 행은 현재 보이는 순서를 그대로 굳힌다. id 는 ULID 라 생성 시각 순이므로,
-- 처음 그린 순서가 곧 아래에서 위로 쌓인 순서다.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "page_id" ORDER BY "id") - 1 AS rn
  FROM "panels"
)
UPDATE "panels" p SET "order" = ranked.rn FROM ranked WHERE p."id" = ranked."id";

DROP INDEX IF EXISTS "panels_page_id_idx";
CREATE INDEX "panels_page_id_order_idx" ON "panels"("page_id", "order");
