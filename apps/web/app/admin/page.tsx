'use client';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/shell/app-shell';
import { PageContainer } from '@/components/shell/page-container';
import { api } from '@/lib/api';
import { ApiPaths, type AdminOverview, type AdminUserRow, type SessionUser } from '@comicai/types';
import { qk } from '@/lib/query-keys';

/**
 * 운영자 현황.
 *
 * 여기서 `isAdmin` 을 보는 것은 **화면을 숨기는 용도일 뿐**이다. 실제 차단은 서버의
 * AdminGuard 가 한다(apps/api/src/auth/admin.guard.ts) — 이 컴포넌트를 통째로
 * 우회해도 API 가 403 을 준다. 클라이언트 판정을 신뢰해서는 안 된다.
 */
export default function AdminPage() {
  const { data: me, isLoading: meLoading } = useQuery<SessionUser>({
    queryKey: qk.me(),
    queryFn: () => api<SessionUser>(ApiPaths.me),
    retry: false,
  });
  const allowed = me?.isAdmin === true;

  const { data: overview } = useQuery<AdminOverview>({
    queryKey: ['admin', 'overview'],
    queryFn: () => api<AdminOverview>(ApiPaths.adminOverview),
    enabled: allowed,
  });
  const { data: users } = useQuery<AdminUserRow[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => api<AdminUserRow[]>(ApiPaths.adminUsers),
    enabled: allowed,
  });

  if (meLoading) {
    return (
      <AppShell>
        <PageContainer>
          <p className="text-body-sm text-muted-foreground">불러오는 중…</p>
        </PageContainer>
      </AppShell>
    );
  }

  if (!allowed) {
    return (
      <AppShell>
        <PageContainer className="py-20 text-center">
          <h1 className="text-title-lg font-semibold">접근할 수 없는 화면입니다</h1>
          <p className="mt-2 text-body-sm text-muted-foreground">
            운영자 계정으로 로그인해야 볼 수 있습니다.
          </p>
        </PageContainer>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageContainer>
        <h1 className="text-title-lg font-semibold sm:text-display-md">운영 현황</h1>
        <p className="mt-2 text-body-sm text-muted-foreground">
          읽기 전용입니다. 여기서는 아무것도 바꿀 수 없습니다.
        </p>

        <section className="mt-8">
          <h2 className="text-title-md font-medium">전체</h2>
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
            <Stat label="가입자" value={overview?.users} />
            <Stat label="이메일 인증 완료" value={overview?.verifiedUsers} />
            <Stat label="프로젝트" value={overview?.projects} />
            <Stat label="페이지" value={overview?.pages} />
            <Stat label="컷" value={overview?.panels} />
            <Stat label="그림 생성 요청" value={overview?.renderJobs} />
          </dl>
        </section>

        <section className="mt-8">
          <h2 className="text-title-md font-medium">그림 생성</h2>
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
            <Stat label="최근 24시간" value={overview?.renderJobsLast24h} />
            {Object.entries(overview?.renderJobsByStatus ?? {}).map(([status, n]) => (
              <Stat key={status} label={STATUS_LABEL[status] ?? status} value={n} />
            ))}
          </dl>
        </section>

        <section className="mt-8">
          <h2 className="text-title-md font-medium">최근 가입</h2>
          {users === undefined ? (
            <p className="mt-3 text-body-sm text-muted-foreground">불러오는 중…</p>
          ) : users.length === 0 ? (
            <p className="mt-3 text-body-sm text-muted-foreground">가입자가 없습니다.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-body-sm">
                <thead className="border-b border-border bg-muted/40 text-caption text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">사용자</th>
                    <th className="px-3 py-2 text-right font-medium">프로젝트</th>
                    <th className="px-3 py-2 text-right font-medium">생성 요청</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-medium">가입일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="max-w-0 px-3 py-2">
                        <div className="truncate font-medium">{u.displayName ?? '이름 없음'}</div>
                        <div className="truncate text-caption text-muted-foreground">
                          {u.email}
                          {!u.emailVerified && ' · 인증 전'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{u.projects}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{u.renderJobs}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-caption text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </PageContainer>
    </AppShell>
  );
}

const STATUS_LABEL: Record<string, string> = {
  queued: '대기 중',
  running: '진행 중',
  succeeded: '성공',
  failed: '실패',
  canceled: '취소됨',
};

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="bg-background px-4 py-3">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-title-lg font-semibold tabular-nums">
        {value === undefined ? '—' : value.toLocaleString('ko-KR')}
      </dd>
    </div>
  );
}
