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
