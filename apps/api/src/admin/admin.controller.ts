import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { prisma } from '@comicai/db';
import {
  AdminTokenGrantSchema,
  TOKEN_ORDER_STATUSES,
  type AdminOrderRow,
  type AdminOverview,
  type AdminUserRow,
  type TokenOrderDTO,
  type TokenOrderStatus,
} from '@comicai/types';
import { AdminGuard } from '../auth/admin.guard';
import { AuthedRequest } from '../auth/session.guard';
import { TokensService } from '../tokens/tokens.service';
import { BillingService } from '../billing/billing.service';

class TokenGrantDto {
  static zodSchema = AdminTokenGrantSchema;
  amount!: number;
  memo!: string;
}

/**
 * 운영자용 읽기 전용 현황.
 *
 * 가드 순서가 중요하다: `SessionGuard` 가 `req.user` 를 채운 뒤라야 `AdminGuard` 가
 * 이메일을 볼 수 있다. 뒤바뀌면 통과가 아니라 예외가 나지만, 그래도 순서는 지킨다.
 *
 * 오래 읽기 전용이었다. 운영 화면에서 지울 수 있게 만드는 순간 실수 한 번의 대가가
 * 커지기 때문이다. 그 전제가 토큰제로 바뀌었다 — **PG 가 붙기 전까지 운영자 지급이
 * 주문을 처리하는 유일한 수단**이고, 환불·보상도 사람이 해야 한다.
 *
 * 그래서 쓰기는 토큰 두 개만 연다. 둘 다 원장에 사유와 함께 남아서 되짚을 수 있다.
 * 삭제 계열은 여전히 없다 — 여기서 늘리지 말 것.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly tokens: TokensService,
    private readonly billing: BillingService,
  ) {}

  @Get('overview')
  async overview(): Promise<AdminOverview> {
    // 카운트 6개를 순차로 돌리면 왕복이 6번이다. 서로 의존이 없으니 한 번에 보낸다.
    const [users, verifiedUsers, projects, pages, panels, renderJobs, byStatus, recentJobs] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
        prisma.project.count(),
        prisma.page.count(),
        prisma.panel.count(),
        prisma.renderJob.count(),
        prisma.renderJob.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.renderJob.count({
          where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
      ]);

    return {
      users,
      verifiedUsers,
      projects,
      pages,
      panels,
      renderJobs,
      renderJobsLast24h: recentJobs,
      renderJobsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    };
  }

  /**
   * 최근 가입 순 사용자 목록.
   *
   * 비밀번호 해시·API 키·아바타 저장 키는 내려보내지 않는다. 운영 화면에서 볼 이유가
   * 없고, 한 번 응답에 실리면 브라우저 캐시·로그·스크린샷을 타고 퍼진다.
   */
  /**
   * 토큰 지급·회수. `amount` 가 음수면 회수다.
   *
   * `memo` 는 필수다. 나중에 "왜 깎였나" 를 묻는 것은 늘 회수 쪽인데, 두 엔드포인트로
   * 가르면 그쪽에만 사유를 빠뜨리기 쉽다.
   *
   * 멱등 키를 붙이지 않는다 — 같은 사유로 두 번 지급하는 것이 **의도된 경우**가 있고
   * (두 번 보상), 운영자는 자기가 누른 것을 안다. 자동 재시도가 없는 유일한 경로다.
   */
  @Post('users/:id/tokens')
  async grantTokens(
    @Req() req: AuthedRequest,
    @Param('id') userId: string,
    @Body() body: TokenGrantDto,
  ): Promise<{ balance: number }> {
    const memo = `${body.memo} (by ${req.user.id})`;
    const balance =
      body.amount > 0
        ? await this.tokens.credit(userId, body.amount, { kind: 'admin_grant', memo })
        : await this.tokens.charge(userId, -body.amount, { kind: 'admin_revoke', memo });
    return { balance };
  }

  /**
   * 처리할 주문 목록.
   *
   * `mark-paid` 만 있고 이게 없으면 흐름이 한 칸 앞에서 끊긴다 — 운영자가 입금을
   * 확인해도 **주문 id 를 알 방법이 없어** DB 를 직접 열어야 한다. 기본값이
   * `pending` 인 이유도 그거다: 운영자가 여기 오는 이유는 처리할 것을 찾기 위해서다.
   *
   * 이메일을 함께 준다. 그게 없으면 목록을 봐도 입금자와 짝지을 수 없다.
   */
  @Get('orders')
  async orders(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ): Promise<AdminOrderRow[]> {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    // 아무 문자열이나 받으면 조용히 빈 목록이 나와 "주문이 없다" 로 오해한다.
    const known = (TOKEN_ORDER_STATUSES as readonly string[]).includes(status ?? '')
      ? (status as TokenOrderStatus)
      : 'pending';
    const rows = await prisma.tokenOrder.findMany({
      where: { status: known },
      orderBy: { createdAt: 'asc' }, // 오래 기다린 것부터.
      take,
      include: { user: { select: { email: true } } },
    });
    return rows.map((o) => ({
      id: o.id,
      userId: o.userId,
      email: o.user.email,
      packageId: o.packageId,
      tokens: o.tokens,
      amountKrw: o.amountKrw,
      status: o.status as TokenOrderStatus,
      provider: o.provider,
      createdAt: o.createdAt.toISOString(),
      paidAt: o.paidAt?.toISOString() ?? null,
    }));
  }

  /** 입금을 확인했을 때. 결제 수단이 붙으면 웹훅이 같은 경로를 쓴다. */
  @Post('orders/:id/mark-paid')
  async markOrderPaid(@Param('id') orderId: string): Promise<TokenOrderDTO> {
    return this.billing.markPaid(orderId);
  }

  @Get('users')
  async users(@Query('limit') limit?: string): Promise<AdminUserRow[]> {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const rows = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        email: true,
        displayName: true,
        emailVerifiedAt: true,
        createdAt: true,
        _count: { select: { projects: true, renderJobs: true } },
        tokenAccount: { select: { balance: true } },
      },
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      emailVerified: u.emailVerifiedAt != null,
      createdAt: u.createdAt.toISOString(),
      projects: u._count.projects,
      renderJobs: u._count.renderJobs,
      // 계정 행은 첫 적립 때 생긴다. 없으면 0 이다.
      tokenBalance: u.tokenAccount?.balance ?? 0,
    }));
  }
}
