import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@comicai/db';
import { startIntegration, stopIntegration, type IntegrationContext } from './setup';
/*
 * **타입만** 가져온다. 값으로 가져오면 이 파일이 평가되는 순간 `@comicai/db` 가 함께
 * 로드돼 `startIntegration()` 이 DATABASE_URL 을 세우기 전에 PrismaClient 가 만들어진다
 * (setup.ts 의 긴 주석 참조). `import type` 은 컴파일에서 지워져 그런 일이 없다.
 */
import type {
  TokensService,
  InsufficientTokensError as InsufficientTokens,
} from '../../src/tokens/tokens.service';
import type { BillingService } from '../../src/billing/billing.service';

/*
 * 토큰은 돈이다. 여기서 틀리면 사용자가 낸 돈이 사라지거나, 우리가 낸 API 비용이
 * 청구되지 않는다. 둘 다 조용히 일어난다 — 잔액은 늘 어떤 숫자이긴 하니까.
 *
 * 진짜 Postgres 가 필요하다. 이 설계의 핵심이 `UPDATE … WHERE balance >= ?` 한 문장의
 * 원자성과 unique 제약이라서, 그 둘을 흉내 낸 스텁으로는 아무것도 증명하지 못한다.
 */

let ctx: IntegrationContext;
let tokens: TokensService;
/** 클래스 자체를 담는다 — `instanceof` 검사에는 런타임 값이 필요하다. */
let InsufficientTokensError: new (required: number, balance: number) => InsufficientTokens;

async function makeUser(): Promise<string> {
  const id = newId('user');
  await ctx.prisma.user.create({
    data: { id, email: `${id}@example.com`, termsAgreedAt: new Date() },
  });
  return id;
}

/** 잔액과 원장 합이 어긋나지 않았는지. 이 불변식이 깨지면 나머지 검사는 의미가 없다. */
async function assertLedgerMatchesBalance(userId: string) {
  const account = await ctx.prisma.tokenAccount.findUnique({ where: { userId } });
  const sum = await ctx.prisma.tokenLedger.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  expect(account?.balance ?? 0).toBe(sum._sum.amount ?? 0);
}

beforeAll(async () => {
  ctx = await startIntegration();
  const mod = await import('../../src/tokens/tokens.service');
  InsufficientTokensError = mod.InsufficientTokensError;
  tokens = ctx.app.get(mod.TokensService);
}, 180_000);

afterAll(async () => {
  await stopIntegration(ctx);
});

beforeEach(async () => {
  await ctx.prisma.tokenLedger.deleteMany();
  await ctx.prisma.tokenAccount.deleteMany();
});

describe('토큰 원장 (testcontainers)', () => {
  it('가입 지급은 여러 번 불러도 한 번만 나간다', async () => {
    const userId = await makeUser();

    await tokens.grantSignupBonus(userId);
    await tokens.grantSignupBonus(userId);
    await tokens.grantSignupBonus(userId);

    const entries = await ctx.prisma.tokenLedger.findMany({ where: { userId } });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('signup_grant');
    await assertLedgerMatchesBalance(userId);
  });

  /*
   * 이 프로젝트의 예전 쿼터는 읽고-검사하고-쓰는 방식이었고, 그러면 동시에 들어온 두
   * 요청이 같은 잔액을 읽어 **둘 다 통과한다.** 렌더는 사람이 버튼을 연타하거나 여러
   * 컷을 한꺼번에 걸면 실제로 동시에 들어온다.
   */
  it('잔액보다 많이 쓸 수 없다 — 동시에 들어와도', async () => {
    const userId = await makeUser();
    await tokens.credit(userId, 3, { kind: 'admin_grant', idempotencyKey: `seed:${userId}` });

    // 1토큰짜리 10건을 한꺼번에. 3건만 성공해야 한다.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        tokens.charge(userId, 1, { kind: 'render', idempotencyKey: `job-${userId}-${i}` }),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(ok).toHaveLength(3);
    expect(rejected).toHaveLength(7);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(InsufficientTokensError);
    }
    expect(await tokens.balance(userId)).toBe(0);
    await assertLedgerMatchesBalance(userId);
  });

  it('실패한 차감은 원장에 아무것도 남기지 않는다', async () => {
    const userId = await makeUser();
    await tokens.credit(userId, 1, { kind: 'admin_grant', idempotencyKey: `seed:${userId}` });

    await expect(
      tokens.charge(userId, 5, { kind: 'render', idempotencyKey: `job:${userId}` }),
    ).rejects.toBeInstanceOf(InsufficientTokensError);

    // 지급 1건만 있어야 한다. 실패한 시도가 내역을 채우면 진짜 소비가 묻힌다.
    const entries = await ctx.prisma.tokenLedger.findMany({ where: { userId } });
    expect(entries).toHaveLength(1);
    expect(await tokens.balance(userId)).toBe(1);
  });

  /*
   * BullMQ 는 transient 실패를 3회까지 재시도하고, 배포 중 stalled 재큐로 잡이
   * 되살아나기도 한다. 그때마다 청구하면 그림 한 장에 토큰이 3~4개 나간다 —
   * 정상 사용자가 잔액의 1/3만 쓰고 막힌다.
   */
  it('같은 렌더 잡은 몇 번을 처리해도 한 번만 청구한다', async () => {
    const userId = await makeUser();
    await tokens.credit(userId, 10, { kind: 'admin_grant', idempotencyKey: `seed:${userId}` });
    const jobId = newId('render');

    for (let i = 0; i < 4; i++) {
      await tokens.charge(userId, 4, {
        kind: 'render',
        idempotencyKey: `render:${jobId}`,
        refId: jobId,
      });
    }

    expect(await tokens.balance(userId)).toBe(6);
    const charges = await ctx.prisma.tokenLedger.findMany({ where: { userId, kind: 'render' } });
    expect(charges).toHaveLength(1);
    await assertLedgerMatchesBalance(userId);
  });

  it('실패한 렌더는 청구한 만큼 정확히 돌려주고, 두 번 돌려주지 않는다', async () => {
    const userId = await makeUser();
    await tokens.credit(userId, 10, { kind: 'admin_grant', idempotencyKey: `seed:${userId}` });
    const jobId = newId('render');

    await tokens.charge(userId, 4, {
      kind: 'render',
      idempotencyKey: `render:${jobId}`,
      refId: jobId,
    });
    expect(await tokens.balance(userId)).toBe(6);

    // 실패와 취소가 겹쳐 들어오는 경우. 한 번만 돌아와야 한다.
    await tokens.refundRender(jobId, '생성 실패');
    await tokens.refundRender(jobId, '생성 취소');

    expect(await tokens.balance(userId)).toBe(10);
    const refunds = await ctx.prisma.tokenLedger.findMany({ where: { userId, kind: 'refund' } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.amount).toBe(4);
    await assertLedgerMatchesBalance(userId);
  });

  /*
   * 사용자 키(BYOK)나 mock 으로 돈 렌더는 애초에 차감이 없다. 그 잡이 실패했다고
   * 토큰을 얹어 주면 **쓴 적 없는 토큰이 생긴다** — 무한 증식 경로다.
   */
  it('차감된 적 없는 잡은 환급하지 않는다', async () => {
    const userId = await makeUser();
    await tokens.credit(userId, 5, { kind: 'admin_grant', idempotencyKey: `seed:${userId}` });

    await tokens.refundRender(newId('render'), '생성 실패');

    expect(await tokens.balance(userId)).toBe(5);
    await assertLedgerMatchesBalance(userId);
  });

  it('내역은 최신순이고 각 항목이 그 시점 잔액을 들고 있다', async () => {
    const userId = await makeUser();
    await tokens.credit(userId, 10, { kind: 'signup_grant', idempotencyKey: `signup:${userId}` });
    await tokens.charge(userId, 4, { kind: 'render', idempotencyKey: `render:a-${userId}` });
    await tokens.charge(userId, 1, { kind: 'render', idempotencyKey: `render:b-${userId}` });

    const history = await tokens.history(userId);
    expect(history.map((h) => h.amount)).toEqual([-1, -4, 10]);
    expect(history.map((h) => h.balanceAfter)).toEqual([5, 6, 10]);
  });
});

/*
 * 구매는 돈이 실제로 오가는 자리다. PG 가 아직 없어 지금은 운영자가 `markPaid` 를
 * 부르지만, 결제 수단이 붙어도 웹훅이 부르는 것은 **같은 함수**다. 웹훅 재전송은 흔하다.
 */
describe('토큰 구매 (testcontainers)', () => {
  let billing: BillingService;

  beforeAll(async () => {
    const mod = await import('../../src/billing/billing.service');
    billing = ctx.app.get(mod.BillingService);
  });

  it('주문만으로는 토큰이 들어가지 않는다', async () => {
    const userId = await makeUser();
    const order = await billing.createOrder(userId, 'basic');

    expect(order.status).toBe('pending');
    expect(await tokens.balance(userId)).toBe(0);
  });

  it('결제 확인은 몇 번을 불러도 한 번만 지급한다', async () => {
    const userId = await makeUser();
    const order = await billing.createOrder(userId, 'basic');

    await billing.markPaid(order.id, 'pg-ref-1');
    await billing.markPaid(order.id, 'pg-ref-1');
    const final = await billing.markPaid(order.id, 'pg-ref-1');

    expect(final.status).toBe('paid');
    expect(await tokens.balance(userId)).toBe(120);
    const purchases = await ctx.prisma.tokenLedger.findMany({
      where: { userId, kind: 'purchase' },
    });
    expect(purchases).toHaveLength(1);
    await assertLedgerMatchesBalance(userId);
  });

  /*
   * 안내가 없으면 주문을 받지 않는다. 받아 두면 사용자는 눌렀고, 주문은 생겼고, 그다음에
   * 할 수 있는 일이 없다 — 성공한 것처럼 보여서 버튼이 없는 것보다 나쁘다.
   */
  it('충전 안내가 없으면 주문을 거부한다', async () => {
    const userId = await makeUser();
    const saved = process.env.BILLING_NOTICE;
    process.env.BILLING_NOTICE = '';
    try {
      await expect(billing.createOrder(userId, 'basic')).rejects.toThrow();
      expect(billing.packages().notice).toBeNull();
    } finally {
      process.env.BILLING_NOTICE = saved;
    }
  });

  /*
   * 주문에 금액을 복사해 두는 이유. 패키지 표만 참조하면 가격을 올리는 순간 옛 주문의
   * 금액이 함께 바뀌어 영수증이 거짓말이 된다.
   */
  it('주문은 만들어질 때의 수량·금액을 자기가 들고 있다', async () => {
    const userId = await makeUser();
    const order = await billing.createOrder(userId, 'starter');

    const row = await ctx.prisma.tokenOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.tokens).toBe(50);
    expect(row.amountKrw).toBe(5000);
    expect(row.packageId).toBe('starter');
  });
});

/*
 * PG 가 붙기 전까지 운영자 지급이 토큰을 파는 유일한 경로다. 그 경로가 실제로 이어지는지
 * — 주문을 **찾을 수 있고**, 찾은 것을 처리하면 잔액이 오르는지 — 를 본다.
 * `mark-paid` 만 있고 목록이 없으면 운영자는 DB 를 직접 열어야 한다.
 */
describe('운영자 주문 처리 (testcontainers)', () => {
  let billing: BillingService;

  beforeAll(async () => {
    const mod = await import('../../src/billing/billing.service');
    billing = ctx.app.get(mod.BillingService);
  });

  it('대기 중인 주문을 누가 냈는지와 함께 찾을 수 있다', async () => {
    const userId = await makeUser();
    const order = await billing.createOrder(userId, 'pro');

    const rows = await ctx.prisma.tokenOrder.findMany({
      where: { status: 'pending' },
      include: { user: { select: { email: true } } },
    });
    const found = rows.find((r) => r.id === order.id);
    expect(found).toBeDefined();
    expect(found?.user.email).toContain('@example.com');

    // 찾은 것을 처리하면 잔액이 오른다 — 이 두 걸음이 이어져야 판매가 성립한다.
    await billing.markPaid(order.id, '입금 확인');
    expect(await tokens.balance(userId)).toBe(700);
    await assertLedgerMatchesBalance(userId);
  });

  /*
   * 통장에 찍히는 것은 이메일이 아니라 **입금자명**이다. 한국 계좌이체에서 그 이름은
   * 가입 이메일과 아무 관계가 없다(가족·회사 명의). 같은 날 두 사람이 같은 패키지를
   * 사면 금액으로도 구분이 안 되므로, 이 값이 없으면 운영자는 짝을 지을 수 없다.
   */
  it('주문에 적은 입금자명이 운영자 목록까지 간다', async () => {
    const userId = await makeUser();
    const order = await billing.createOrder(userId, 'basic', '김입금');

    expect(order.depositorName).toBe('김입금');
    const row = await ctx.prisma.tokenOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.depositorName).toBe('김입금');
  });

  it('접은 주문은 처리되지 않는다', async () => {
    const userId = await makeUser();
    const order = await billing.createOrder(userId, 'starter');
    await billing.cancelOrder(userId, order.id);

    await expect(billing.markPaid(order.id)).rejects.toThrow();
    expect(await tokens.balance(userId)).toBe(0);
  });

  it('남의 주문은 접을 수 없다', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const order = await billing.createOrder(owner, 'basic');

    await expect(billing.cancelOrder(stranger, order.id)).rejects.toThrow();
    const row = await ctx.prisma.tokenOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe('pending');
  });
});
