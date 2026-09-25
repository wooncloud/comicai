'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Settings } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { PageContainer } from '@/components/shell/page-container';
import { useProject } from '@/lib/use-project';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { SettingBookSummary } from '@/components/consistency/setting-book-summary';
import { EpisodeList } from '@/components/project/episode-list';

/**
 * 프로젝트 화면.
 *
 * 설정집 요약이 맨 위, 그 아래가 화 목록이다. 페이지는 화 안에 있다 —
 * 예전에는 프로젝트에 바로 매달려 한 줄로 늘어섰고, 연재에서는 40장이 평평하게
 * 쌓여 3화를 고치려면 목록을 세어야 했다.
 */
export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  /*
   * 예전에는 `useState` + `void load…()` 로 읽었고 `catch` 가 없었다. 조회가
   * 실패하면 제목은 영원히 "불러오는 중…", 본문에는 **"아직 페이지가 없습니다"**
   * 점선 박스가 떴다 — 페이지 10장짜리 작품을 가진 사람이 자기 작업이 날아갔다고
   * 읽는다. react-query 안으로 들여보내면 실패가 오류 경계로 간다.
   */
  const project = useProject(projectId);
  return (
    <AppShell
      breadcrumb={
        <Breadcrumb
          items={[{ label: '대시보드', href: '/dashboard' }, { label: project?.name ?? '…' }]}
        />
      }
    >
      <PageContainer>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="min-w-0 break-words text-title-lg font-semibold [text-wrap:balance] sm:text-display-md">
            {/* 제목 자리가 비면 레이아웃이 흔들리므로 자리는 지키되, 아직 이름이
                아닌 것을 제목 크기로 외치지 않는다. */}
            {project?.name ?? (
              <span className="text-body-lg font-normal text-muted-foreground">불러오는 중…</span>
            )}
          </h1>
          <Button asChild variant="outline" size="sm" className="shrink-0 self-start sm:self-auto">
            <Link href={`/projects/${projectId}/settings`}>
              <Settings className="h-4 w-4 shrink-0" />
              프로젝트 설정
            </Link>
          </Button>
        </div>

        <SettingBookSummary projectId={projectId} />

        <EpisodeList projectId={projectId} />
      </PageContainer>
    </AppShell>
  );
}
