-- AlterTable
ALTER TABLE "speech_bubbles" ADD COLUMN     "text" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "text_style" JSONB NOT NULL DEFAULT '{}';
