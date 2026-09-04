-- 이메일을 대소문자 구분 없이 유일하게 만든다.
--
-- 왜: text 컬럼의 unique 는 대소문자를 구분해서 `Admin@x.com` 과 `admin@x.com` 이
-- 서로 다른 계정이 됐다. 그런데 운영자 판정(isAdminEmail)은 소문자로 비교하므로,
-- 운영자 이메일의 대소문자만 바꿔 가입하면 그대로 운영자가 됐다. 공개 저장소의
-- git log 에 운영자 이메일이 보이므로 누구나 실행할 수 있는 경로였다.
--
-- 앱 쪽(Zod EmailSchema)에서도 정규화하지만, 앱을 우회하는 경로가 생겨도 안전해야
-- 하므로 DB 에서 한 번 더 막는다.

CREATE EXTENSION IF NOT EXISTS citext;

-- 대소문자만 다른 중복이 있으면 여기서 멈춘다. 어느 계정을 남길지는 사람이
-- 정해야 하는 문제라, 조용히 하나를 지우거나 이메일을 변형하지 않는다.
DO $$
DECLARE dup text;
BEGIN
  SELECT lower(email) INTO dup
  FROM "users" GROUP BY lower(email) HAVING count(*) > 1 LIMIT 1;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION '대소문자만 다른 중복 이메일이 있습니다 (예: %). 어느 계정을 남길지 정한 뒤 다시 배포하세요.', dup;
  END IF;
END $$;

UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");

ALTER TABLE "users" ALTER COLUMN "email" TYPE citext;
