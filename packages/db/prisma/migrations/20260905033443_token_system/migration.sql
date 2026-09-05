-- CreateTable
CREATE TABLE "token_accounts" (
    "user_id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_accounts_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "token_ledger" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "memo" TEXT,
    "ref_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "amount_krw" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "token_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_ledger_idempotency_key_key" ON "token_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "token_ledger_user_id_created_at_idx" ON "token_ledger"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "token_orders_user_id_created_at_idx" ON "token_orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "token_orders_status_idx" ON "token_orders"("status");

-- AddForeignKey
ALTER TABLE "token_accounts" ADD CONSTRAINT "token_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_orders" ADD CONSTRAINT "token_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 기존 사용자 백필.
--
-- 이 마이그레이션 전에는 하루 20장 무료였다(PLATFORM_DAILY_RENDER_LIMIT). 토큰으로
-- 바꾸면서 백필을 안 하면 **배포되는 순간 기존 사용자 전원이 잔액 0 으로 막힌다** —
-- 어제까지 쓰던 사람이 오늘 아무것도 못 한다.
--
-- 가입 지급과 같은 양을 준다. 수량이 앱 상수(SIGNUP_GRANT_TOKENS)와 여기 두 곳에 있는데,
-- 이건 한 번만 도는 백필이라 앞으로 갈라질 일이 없다. 값을 바꾸려면 앱 상수만 고치면 된다.
INSERT INTO "token_accounts" ("user_id", "balance", "updated_at")
SELECT "id", 20, now() FROM "users"
ON CONFLICT ("user_id") DO NOTHING;

INSERT INTO "token_ledger" ("id", "user_id", "amount", "balance_after", "kind", "idempotency_key", "memo", "created_at")
SELECT
  'tkl_' || replace(gen_random_uuid()::text, '-', ''),
  "id",
  20,
  20,
  'signup_grant',
  -- 가입 지급과 같은 키 공간을 쓴다. 나중에 같은 사용자에게 가입 지급이 또 들어와도
  -- unique 제약이 막는다.
  'signup:' || "id",
  '토큰제 전환 전 가입자',
  now()
FROM "users"
ON CONFLICT ("idempotency_key") DO NOTHING;
