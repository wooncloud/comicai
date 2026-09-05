import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import {
  TOKEN_PACKAGES,
  type TokenOrderDTO,
  type TokenOrderStatus,
  type TokenPackagesDTO,
} from '@comicai/types';
import { apiError } from '../common/api-error';
import { nonEmpty } from '../common/non-empty';
import { TokensService } from '../tokens/tokens.service';

/**
 * 토큰 구매.
 *
 * ## PG 가 아직 없다
 *
 * 주문은 `pending` 으로만 만들어지고, 실제로 토큰이 들어가는 곳은 `markPaid` 하나다.
 * 지금 그걸 부르는 것은 운영자뿐이다(입금 확인 후 수동 처리).
 *
 * **결제 수단이 붙어도 이 구조는 그대로다.** PG 웹훅이 하는 일은 결국 "이 주문이
 * 결제됐다" 를 알리는 것이고, 그때도 같은 `markPaid` 를 부른다. 그래서 어댑터
 * 인터페이스를 미리 만들지 않았다 — 구현이 하나뿐인 인터페이스는 seam 이 아니라 장식이고,
 * 진짜 seam 은 "결제 확인 → 토큰 지급" 을 한 함수로 모아 둔 이 자리다.
 *
 * ## 금액을 주문에 복사해 둔다
 *
 * `TOKEN_PACKAGES` 를 참조만 하면 가격을 올리는 순간 **옛 주문의 금액이 함께 바뀐다.**
 * 영수증이 거짓말을 하게 되고, 대사(對査)도 불가능해진다.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly tokens: TokensService) {}

  packages(): TokenPackagesDTO {
    // 안내가 없으면 주문을 받지 않는다 — 화면이 `notice === null` 로 그걸 판단한다.
    return {
      packages: [...TOKEN_PACKAGES],
      notice: nonEmpty(process.env.BILLING_NOTICE?.trim()) ?? null,
    };
  }

  /** 안내가 없으면 주문을 받을 수 없다. 받아 봐야 사용자가 다음에 할 일이 없다. */
  private assertOrderable(): void {
    if (this.packages().notice) return;
    throw new BadRequestException(
      apiError({ code: 'CONFLICT', message: '지금은 충전 요청을 받지 않습니다.' }),
    );
  }

  async createOrder(
    userId: string,
    packageId: string,
    depositorName?: string,
  ): Promise<TokenOrderDTO> {
    this.assertOrderable();
    const pkg = TOKEN_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      throw new BadRequestException(
        apiError({ code: 'VALIDATION_ERROR', message: '없는 상품입니다.' }),
      );
    }
    const row = await prisma.tokenOrder.create({
      data: {
        id: newId('ord'),
        userId,
        packageId: pkg.id,
        tokens: pkg.tokens,
        amountKrw: pkg.amountKrw,
        depositorName: depositorName ?? null,
        status: 'pending',
        // 결제 수단이 붙기 전까지는 사람이 확인한다.
        provider: 'manual',
      },
    });
    return toDto(row);
  }

  /**
   * 아직 처리되지 않은 주문을 사용자가 스스로 접는다.
   *
   * 없으면 잘못 누른 주문이 영원히 `pending` 으로 남아, 운영자는 "세 개를 진짜 사려던
   * 건가" 를 알 수 없다. 이미 지급된 주문은 건드리지 않는다.
   */
  async cancelOrder(userId: string, orderId: string): Promise<void> {
    const { count } = await prisma.tokenOrder.updateMany({
      where: { id: orderId, userId, status: 'pending' },
      data: { status: 'canceled' },
    });
    if (count === 0) {
      throw new NotFoundException(apiError({ code: 'RESOURCE_NOT_FOUND' }));
    }
  }

  async listOrders(userId: string): Promise<TokenOrderDTO[]> {
    const rows = await prisma.tokenOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map(toDto);
  }

  /**
   * 주문을 결제됨으로 바꾸고 토큰을 넣는다. **결제 확인의 유일한 출구다.**
   *
   * 두 번 불려도 한 번만 지급된다 — 상태 전이는 `pending` 일 때만 성사되는 조건부
   * 갱신이고, 지급 자체도 주문 id 로 멱등하다. 나중에 붙을 PG 웹훅은 재전송이 흔하다.
   *
   * 지급이 먼저, 상태가 나중이 아니다. 순서를 뒤집으면 지급 도중 프로세스가 죽었을 때
   * "결제됨인데 토큰은 없는" 주문이 남고, 그건 사용자가 돈만 내고 아무것도 못 받은
   * 상태다. 지금 순서에서는 최악이 "pending 인데 토큰은 들어간" 상태이고, 그건 다시
   * 불러 고칠 수 있다.
   */
  async markPaid(orderId: string, providerRef?: string): Promise<TokenOrderDTO> {
    const order = await prisma.tokenOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(apiError({ code: 'RESOURCE_NOT_FOUND' }));
    if (order.status === 'paid') return toDto(order);
    if (order.status !== 'pending') {
      throw new BadRequestException(
        apiError({ code: 'CONFLICT', message: '이미 종료된 주문입니다.' }),
      );
    }

    await this.tokens.credit(order.userId, order.tokens, {
      kind: 'purchase',
      idempotencyKey: `order:${order.id}`,
      refId: order.id,
      memo: `${order.packageId} 충전`,
    });

    const { count } = await prisma.tokenOrder.updateMany({
      where: { id: orderId, status: 'pending' },
      data: { status: 'paid', paidAt: new Date(), providerRef: providerRef ?? null },
    });
    if (count === 0) {
      // 지급은 멱등하므로 이 경합에서 토큰이 두 번 들어가지는 않는다. 기록만 알린다.
      this.logger.warn(`주문 상태가 이미 바뀌어 있었다: ${orderId}`);
    }
    const fresh = await prisma.tokenOrder.findUniqueOrThrow({ where: { id: orderId } });
    return toDto(fresh);
  }
}

function toDto(row: {
  id: string;
  packageId: string;
  depositorName: string | null;
  tokens: number;
  amountKrw: number;
  status: string;
  provider: string;
  createdAt: Date;
  paidAt: Date | null;
}): TokenOrderDTO {
  return {
    id: row.id,
    packageId: row.packageId,
    depositorName: row.depositorName,
    tokens: row.tokens,
    amountKrw: row.amountKrw,
    status: row.status as TokenOrderStatus,
    provider: row.provider,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
  };
}
