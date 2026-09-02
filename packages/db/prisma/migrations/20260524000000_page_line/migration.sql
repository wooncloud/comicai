-- 페이지 직속 자유 직선(PageLine). 패널/말풍선/텍스트와 마찬가지로
-- 렌더 IR에는 포함되지 않고 export 합성에서 SVG 오버레이로만 사용된다.

CREATE TABLE "page_lines" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "x1" DOUBLE PRECISION NOT NULL,
    "y1" DOUBLE PRECISION NOT NULL,
    "x2" DOUBLE PRECISION NOT NULL,
    "y2" DOUBLE PRECISION NOT NULL,
    "style" JSONB NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "page_lines_page_id_order_idx" ON "page_lines"("page_id", "order");

ALTER TABLE "page_lines" ADD CONSTRAINT "page_lines_page_id_fkey"
    FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
