import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { prisma } from '@comicai/db';
import type { AdminOverview, AdminUserRow } from '@comicai/types';
import { AdminGuard } from '../auth/admin.guard';

/**
 * 운영자용 읽기 전용 현황.
 *
 * 가드 순서가 중요하다: `SessionGuard` 가 `req.user` 를 채운 뒤라야 `AdminGuard` 가
 * 이메일을 볼 수 있다. 뒤바뀌면 통과가 아니라 예외가 나지만, 그래도 순서는 지킨다.
 *
 * 쓰기 동작은 일부러 넣지 않았다. 운영 화면에서 지울 수 있게 만드는 순간
 * 실수 한 번의 대가가 커지고, 지금 필요한 것은 "무슨 일이 벌어지고 있는지" 뿐이다.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
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
    }));
  }
}
