-- 화(話): 프로젝트와 페이지 사이에 한 단계를 둔다.
--
-- 기존 페이지는 프로젝트에 바로 매달려 있었다. 단편이면 괜찮지만 연재에서는 40장이
-- 평평하게 쌓여, 3화를 고치려면 목록을 세어야 했다.
--
-- **기존 데이터는 하나도 잃지 않는다.** 프로젝트마다 화를 하나(1화) 만들고, 그 프로젝트의
-- 페이지를 전부 거기에 넣는다. 사용자 눈에는 "1화" 가 하나 생긴 것뿐이다.

CREATE TABLE "episodes" (
  "id"         TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "order"      INTEGER NOT NULL,
  -- null 이면 `order` 로 "N화" 를 만든다. 번호를 따로 저장하지 않는 이유는
  -- 프롤로그·외전·8.5화처럼 순서와 이름이 어긋나는 편이 실제로 생기기 때문이다.
  "title"      TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- `pages` 가 (episode_id, project_id) 쌍으로 걸 수 있게 한다 — 다른 프로젝트의 화에
-- 페이지가 붙는 상태를 DB 가 막는다.
CREATE UNIQUE INDEX "episodes_id_project_id_key" ON "episodes"("id", "project_id");
CREATE INDEX "episodes_project_id_order_idx" ON "episodes"("project_id", "order");

ALTER TABLE "episodes"
  ADD CONSTRAINT "episodes_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 프로젝트마다 1화 하나. id 는 애플리케이션이 쓰는 ULID 모양을 흉내 내지 않고,
-- 한눈에 마이그레이션이 만든 것임을 알 수 있게 접두사를 붙인다.
INSERT INTO "episodes" ("id", "project_id", "order", "title", "created_at", "updated_at")
SELECT 'ep_mig_' || replace(gen_random_uuid()::text, '-', ''), p."id", 0, NULL, p."created_at", NOW()
FROM "projects" p;

ALTER TABLE "pages" ADD COLUMN "episode_id" TEXT;

UPDATE "pages" pg
SET "episode_id" = e."id"
FROM "episodes" e
WHERE e."project_id" = pg."project_id";

-- 위 UPDATE 가 모든 행을 채웠어야 한다. 하나라도 비었으면 NOT NULL 에서 터져
-- 트랜잭션이 통째로 되돌아간다 — 반쯤 옮겨진 상태로 남는 것보다 낫다.
ALTER TABLE "pages" ALTER COLUMN "episode_id" SET NOT NULL;

ALTER TABLE "pages"
  ADD CONSTRAINT "pages_episode_id_project_id_fkey"
  FOREIGN KEY ("episode_id", "project_id") REFERENCES "episodes"("id", "project_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "pages_episode_id_order_idx" ON "pages"("episode_id", "order");
