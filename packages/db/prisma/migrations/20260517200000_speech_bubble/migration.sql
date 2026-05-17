-- SpeechBubble: 페이지 직속, 패널 위에 오버레이되는 말풍선. 렌더에는 영향 없고 export 합성에만 사용.
CREATE TABLE "speech_bubbles" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "shape" JSONB NOT NULL,
    "text" JSONB NOT NULL DEFAULT '{}',
    "style" JSONB NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "speech_bubbles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "speech_bubbles_page_id_order_idx" ON "speech_bubbles"("page_id", "order");

ALTER TABLE "speech_bubbles" ADD CONSTRAINT "speech_bubbles_page_id_fkey"
    FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
