import { Injectable, Logger } from '@nestjs/common';
import { Prisma, prisma, newId } from '@comicai/db';
import {
  MODEL_TOKEN_COST,
  MODEL_IDS,
  SIGNUP_GRANT_TOKENS,
  type ModelId,
  type TokenBalanceDTO,
  type TokenLedgerEntryDTO,
  type TokenLedgerKind,
} from '@comicai/types';

export class InsufficientTokensError extends Error {
  readonly category = 'quota' as const;
  constructor(
    readonly required: number,
    readonly balance: number,
  ) {
    super(`토큰이 부족합니다 (필요 ${required}, 잔액 ${balance})`);
  }
}

interface MovementOptions {
  kind: TokenLedgerKind;
  /**
   * 같은 사건을 두 번 기록하지 않기 위한 키. **생략하지 말 것** — 재시도가 있는 경로에서
   * 이게 없으면 한 사건이 여러 번 청구된다. 재시도가 없는 경로에서도 붙여 두면 나중에
   * 재시도가 생겼을 때 조용히 이중 청구되는 일을 막는다.
   */
  idempotencyKey?: string;
  /** 연결된 대상(렌더 잡 id, 주문 id). 문의를 되짚는 실마리다. */
  refId?: string;
  memo?: string;
}

/**
 * 토큰 잔액과 원장.
 *
 * ## 왜 원장인가
 *
 * 잔액 하나만 들고 있으면 "왜 12 인가" 에 답할 수 없다. 사용자가 "안 썼는데 줄었다" 고
 * 물었을 때 되짚을 근거가 없고, 버그로 잔액이 틀어져도 고칠 방법이 없다. 그래서 움직임은
 * 전부 `token_ledger` 에 남기고, `token_accounts.balance` 는 그 합의 캐시로만 둔다.
 *
 * ## 왜 캐시를 따로 두는가
 *
 * 합을 매번 세면 내역이 쌓일수록 느려지는 것도 있지만, 더 중요한 이유는 **그 행이
 * 동시성 통제 지점**이라는 것이다. 차감은
 *
 *     UPDATE token_accounts SET balance = balance - ? WHERE user_id = ? AND balance >= ?
 *
 * 한 문장이고, 그 `WHERE` 가 곧 "잔액보다 많이 쓸 수 없다" 는 보장이다. 애플리케이션에서
 * 읽고-검사하고-쓰면 동시에 들어온 두 요청이 같은 잔액을 읽어 **둘 다 통과한다.**
 *
 * ## 실패한 렌더는 돌려준다
 *
 * 차감이 곧 예약이다. 시작하는 순간 잔액이 줄고(그래서 잔액 1로 100장을 동시에 시작할 수
 * 없다), 실패·시간초과·취소로 끝나면 `refund` 항목을 더해 되돌린다. 예약 상태를 따로 든
 * 컬럼은 없다 — 가용 잔액이 곧 잔액이라 화면과 검사가 같은 수를 본다.
 */
@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);

  /** 이 모델로 그림 한 장을 만드는 데 드는 토큰. */
  costOf(model: ModelId): number {
    return MODEL_TOKEN_COST[model];
  }

  async balance(userId: string): Promise<number> {
    const row = await prisma.tokenAccount.findUnique({ where: { userId } });
    return row?.balance ?? 0;
  }

  async balanceDto(userId: string): Promise<TokenBalanceDTO> {
    const balance = await this.balance(userId);
    const affordable = {} as Record<ModelId, number | null>;
    for (const model of MODEL_IDS) {
      const cost = this.costOf(model);
      // 공짜 모델(mock)은 제한이 없다. `Infinity` 는 JSON 에서 null 이 되므로 처음부터
      // null 로 보낸다 — 타입도 그렇게 말한다.
      affordable[model] = cost <= 0 ? null : Math.floor(balance / cost);
    }
    return { balance, affordable };
  }

  /**
   * 차감한다. 잔액이 모자라면 `InsufficientTokensError` 를 던지고 **아무것도 기록하지
   * 않는다** — 실패한 시도가 내역을 채우면 진짜 소비가 묻힌다.
   *
   * @returns 차감 후 잔액
   */
  async charge(userId: string, amount: number, opts: MovementOptions): Promise<number> {
    if (amount <= 0) throw new Error('charge 는 양수만 받는다');
    return this.move(userId, -amount, opts);
  }

  /** 적립한다(지급·환급·구매). */
  async credit(userId: string, amount: number, opts: MovementOptions): Promise<number> {
    if (amount <= 0) throw new Error('credit 은 양수만 받는다');
    return this.move(userId, amount, opts);
  }

  /**
   * 가입 지급. **여러 번 불러도 한 번만 지급된다** — 키가 `signup:{userId}` 라
   * unique 제약이 막는다. OAuth 재가입이나 재시도로 두 번 불리는 경로가 실제로 있다.
   */
  async grantSignupBonus(userId: string): Promise<void> {
    if (SIGNUP_GRANT_TOKENS <= 0) return;
    await this.credit(userId, SIGNUP_GRANT_TOKENS, {
      kind: 'signup_grant',
      idempotencyKey: `signup:${userId}`,
      memo: '가입 축하 지급',
    });
  }

  /**
   * 렌더 잡에 걸린 차감을 되돌린다. 실패·시간초과·취소에서 부른다.
   *
   * **얼마를 돌려줄지 원장에서 읽는다.** 워커가 기억하고 있다가 넘기면, 재배포로
   * 프로세스가 바뀌었거나 stalled 재큐로 다른 워커가 마무리하는 경우 그 값이 없다.
   * 원장은 그때도 남아 있다.
   *
   * 차감 기록이 없으면 아무것도 하지 않는다 — 사용자 키(BYOK)나 mock 으로 돌아 애초에
   * 차감이 없었던 경우다. 환급 자체도 `refund:{jobId}` 로 멱등해서, 취소와 실패가
   * 겹쳐 들어와도 두 번 돌려주지 않는다.
   */
  async refundRender(jobId: string, reason: string): Promise<void> {
    const charged = await prisma.tokenLedger.findUnique({
      where: { idempotencyKey: renderChargeKey(jobId) },
    });
    if (!charged) return;
    const amount = -charged.amount; // 차감은 음수로 기록돼 있다
    if (amount <= 0) return;
    await this.credit(charged.userId, amount, {
      kind: 'refund',
      idempotencyKey: `refund:${jobId}`,
      refId: jobId,
      memo: reason,
    });
  }

  async history(userId: string, limit = 50): Promise<TokenLedgerEntryDTO[]> {
    const rows = await prisma.tokenLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      balanceAfter: r.balanceAfter,
      kind: r.kind as TokenLedgerKind,
      memo: r.memo,
      refId: r.refId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * 잔액을 옮기고 원장에 남긴다. 둘은 **같은 트랜잭션**이어야 한다 — 하나만 성공하면
   * 잔액과 내역이 갈리고, 그때부터 어느 쪽이 맞는지 알 수 없다.
   *
   * 멱등성은 원장의 unique 제약으로 잡는다. 이미 기록된 사건이면 잔액 변경까지 함께
   * 롤백되고, 그때의 잔액을 돌려준다. "이미 처리했다" 와 "방금 처리했다" 를 호출부가
   * 구별할 필요가 없게 하기 위해서다.
   */
  private async move(userId: string, delta: number, opts: MovementOptions): Promise<number> {
    /*
     * 이미 기록된 사건인지 **먼저 읽는다.** 아래 unique 제약만으로도 정확성은 보장되지만,
     * 그 경로는 INSERT 를 실패시켜 Prisma 가 `prisma:error` 를 찍는다. 워커 재시도는
     * 정상 동작이라 그때마다 오류 로그가 쌓이면 진짜 장애 신호가 묻힌다.
     *
     * 이 검사와 아래 INSERT 사이에는 창이 있다. 그건 제약이 막고, 그 드문 경우에만
     * catch 로 떨어진다 — 흔한 길을 조용하게, 드문 길을 안전하게.
     */
    if (opts.idempotencyKey) {
      const done = await prisma.tokenLedger.findUnique({
        where: { idempotencyKey: opts.idempotencyKey },
      });
      if (done) return done.balanceAfter;
    }
    try {
      return await prisma.$transaction(async (tx) => {
        const balanceAfter = await this.applyDelta(tx, userId, delta);
        await tx.tokenLedger.create({
          data: {
            id: newId('tkl'),
            userId,
            amount: delta,
            balanceAfter,
            kind: opts.kind,
            idempotencyKey: opts.idempotencyKey ?? null,
            refId: opts.refId ?? null,
            memo: opts.memo ?? null,
          },
        });
        return balanceAfter;
      });
    } catch (err) {
      if (isDuplicateLedgerEntry(err) && opts.idempotencyKey) {
        const existing = await prisma.tokenLedger.findUnique({
          where: { idempotencyKey: opts.idempotencyKey },
        });
        // 트랜잭션이 통째로 롤백됐으므로 잔액은 건드려지지 않았다.
        this.logger.debug(`이미 기록된 사건이라 건너뜀: ${opts.idempotencyKey}`);
        return existing?.balanceAfter ?? (await this.balance(userId));
      }
      throw err;
    }
  }

  /**
   * 잔액에 `delta` 를 더하고 결과를 돌려준다.
   *
   * 차감일 때만 `balance >= 필요량` 을 조건에 넣는다. 그 조건이 걸러 내면 갱신된 행이
   * 0개이고, 그게 곧 "잔액 부족" 이다. 읽어서 비교하지 않는 이유는 위 클래스 주석 참조.
   *
   * 적립은 계정 행이 없어도 만들어 준다. 가입 지급 전에 다른 경로로 적립이 먼저 올 수
   * 있고(운영자 지급), 계정 행이 없다는 이유로 실패하면 그건 우리 사정이지 사용자
   * 사정이 아니다.
   */
  private async applyDelta(
    tx: Prisma.TransactionClient,
    userId: string,
    delta: number,
  ): Promise<number> {
    if (delta >= 0) {
      const rows = await tx.$queryRaw<{ balance: number }[]>`
        INSERT INTO token_accounts (user_id, balance, updated_at)
        VALUES (${userId}, ${delta}, now())
        ON CONFLICT (user_id)
          DO UPDATE SET balance = token_accounts.balance + ${delta}, updated_at = now()
        RETURNING balance
      `;
      const balance = rows[0]?.balance;
      if (balance === undefined) throw new Error('잔액 적립이 아무 행도 남기지 않았다');
      return balance;
    }

    const needed = -delta;
    const rows = await tx.$queryRaw<{ balance: number }[]>`
      UPDATE token_accounts
      SET balance = balance - ${needed}, updated_at = now()
      WHERE user_id = ${userId} AND balance >= ${needed}
      RETURNING balance
    `;
    const balance = rows[0]?.balance;
    if (balance === undefined) {
      // 계정 행이 아예 없는 경우와 모자란 경우를 여기서 합친다 — 사용자에게는 같은 뜻이다.
      const current = await tx.tokenAccount.findUnique({ where: { userId } });
      throw new InsufficientTokensError(needed, current?.balance ?? 0);
    }
    return balance;
  }
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

/** 렌더 잡 하나의 차감을 가리키는 원장 키. 차감과 환급이 같은 규칙으로 찾아야 한다. */
export function renderChargeKey(jobId: string): string {
  return `render:${jobId}`;
}

/** 원장 멱등 키 충돌인가. 다른 unique 충돌(있다면)까지 삼키지 않도록 대상을 확인한다. */
function isDuplicateLedgerEntry(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  // `meta.target` 은 unknown 이다 — 드라이버에 따라 문자열이거나 문자열 배열이고,
  // 그 외 형태면 판단하지 않는다(다른 unique 충돌을 삼키지 않기 위해).
  const target: unknown = err.meta?.target;
  const fields =
    typeof target === 'string' ? [target] : Array.isArray(target) ? target.filter(isString) : [];
  return fields.some((f) => f.includes('idempotency_key') || f.includes('idempotencyKey'));
}
