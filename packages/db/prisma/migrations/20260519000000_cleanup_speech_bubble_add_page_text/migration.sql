-- 말풍선 슬림화 + 자유 텍스트 오브젝트(PageText) 신설.
-- 1) SpeechBubble: variant 6→4 (cloud/thought 제거), text 컬럼 삭제, style JSON 텍스트 키 제거.
-- 2) PageText 신규 테이블.

-- variant 정리 (개발 데이터 일관성 — 기존 cloud/thought 는 ellipse 로 변환)
UPDATE "speech_bubbles" SET "variant" = 'ellipse' WHERE "variant" IN ('cloud', 'thought');

-- text 컬럼 제거
ALTER TABLE "speech_bubbles" DROP COLUMN "text";

-- style JSON 의 텍스트 관련 키 제거
UPDATE "speech_bubbles"
SET "style" = ("style" - 'fontSize' - 'fontFamily' - 'textColor' - 'textAlign');

-- PageText: 페이지 직속 자유 텍스트 (만화 효과음 등). export 시 최상단 레이어.
CREATE TABLE "page_texts" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "style" JSONB NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_texts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "page_texts_page_id_order_idx" ON "page_texts"("page_id", "order");

ALTER TABLE "page_texts" ADD CONSTRAINT "page_texts_page_id_fkey"
    FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
