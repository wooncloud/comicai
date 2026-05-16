-- 모델 ID 변경: gemini-nano-banana → gemini-3.1-flash-image-preview, gpt-image-1 → gpt-image-2
UPDATE "render_jobs" SET "model" = 'gemini-3.1-flash-image-preview' WHERE "model" = 'gemini-nano-banana';
UPDATE "render_jobs" SET "model" = 'gpt-image-2' WHERE "model" = 'gpt-image-1';
