-- 모델 판 올리기: 프로젝트 **설정**만 지금 판으로 옮긴다.
--
-- `projects.default_model` 은 "다음에 그릴 때 무엇을 쓸까" 라는 설정이다. 옛 id 가
-- 남아 있으면 프로젝트 설정 화면의 선택 상자에 맞는 항목이 없어 **빈칸으로 보인다**
-- (선택지는 지금 고를 수 있는 모델만 담는다).
--
-- `render_jobs.model` 은 건드리지 않는다. 그건 설정이 아니라 **그때 실제로 쓴 모델의
-- 기록**이다. 뒤늦게 고쳐 쓰면 원장과 히스토리가 쓰지 않은 모델 이름을 말하게 된다.
UPDATE "projects" SET "default_model" = 'gemini-3.1-flash-image' WHERE "default_model" = 'gemini-3.1-flash-image-preview';
UPDATE "projects" SET "default_model" = 'gpt-image-2.5-flare' WHERE "default_model" = 'gpt-image-2';
