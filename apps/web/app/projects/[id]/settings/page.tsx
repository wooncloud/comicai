'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { PageContainer } from '@/components/shell/page-container';
import { api } from '@/lib/api';
import { useProject } from '@/lib/use-project';
import { ApiPaths, type ModelId, type ProjectDTO } from '@comicai/types';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/error-message';
import { qk } from '@/lib/query-keys';
import { MODEL_OPTIONS } from '@/lib/model-options';

/** Select 는 빈 문자열을 값으로 못 쓴다. "지정 안 함" 을 나타내는 자리표시자. */
const NO_MODEL = '__none__';

/**
 * 프로젝트 단위 설정.
 *
 * 예전에는 '기본 AI 서비스' select 와 '캐릭터·설정 관리' 버튼이 프로젝트 상세 화면의
 * 제목 옆에 나란히 붙어 있었다. 자주 쓰지 않는 설정이 목록을 보는 화면의 헤더를
 * 차지했고, 좁은 화면에서는 제목 아래로 줄바꿈돼 무엇이 제목인지도 흐려졌다.
 *
 * 여기 모아 두면 앞으로 프로젝트 단위 설정이 늘어나도 헤더가 다시 붐비지 않는다.
 */
export default function ProjectSettingsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const project = useProject(projectId);
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();

  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * 저장 결과를 react-query 캐시에 직접 넣는다.
   *
   * 로컬 state 로만 들고 있으면 안 된다 — 패널 인스펙터가 같은 `qk.project` 를
   * 구독하면서 렌더 모델 기본값으로 쓰는데, staleTime 30초 + refetchOnWindowFocus:false
   * 라서 여기서 바꾼 모델이 에디터에 최대 30초간 반영되지 않는다.
   */
  async function patch(body: Partial<Pick<ProjectDTO, 'name' | 'defaultModel'>>, action: string) {
    setBusy(true);
    try {
      const updated = await api<ProjectDTO>(ApiPaths.project(projectId), {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      queryClient.setQueryData(qk.project(projectId), updated);
      // 대시보드 목록도 같은 프로젝트를 들고 있다. 그냥 두면 옛 이름이 남는다.
      queryClient.setQueryData<ProjectDTO[]>(
        qk.projects(),
        (prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? prev,
      );
      return updated;
    } catch (err) {
      toast.push('error', errorMessage(err, action));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    const name = nameDraft?.trim() ?? '';
    if (!name || name === project?.name) {
      setNameDraft(null);
      return;
    }
    if (await patch({ name }, '이름을 변경')) {
      setNameDraft(null);
      toast.push('success', '프로젝트 이름을 변경했습니다.');
    }
  }

  async function remove() {
    if (!project) return;
    if (!confirm(`'${project.name}' 프로젝트를 삭제하시겠습니까? 페이지도 함께 사라집니다.`)) {
      return;
    }
    setBusy(true);
    try {
      await api(ApiPaths.project(projectId), { method: 'DELETE' });
      queryClient.setQueryData<ProjectDTO[]>(
        qk.projects(),
        (prev) => prev?.filter((p) => p.id !== projectId) ?? prev,
      );
      toast.push('success', '프로젝트를 삭제했습니다.');
      router.push('/dashboard');
    } catch (err) {
      toast.push('error', errorMessage(err, '프로젝트를 삭제'));
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageContainer>
        {/* 바깥 폭은 다른 화면과 같게 두고, 읽기 좋은 줄 길이는 안쪽에서 잡는다. */}
        <div className="max-w-2xl">
          <Breadcrumb
            items={[
              { label: '대시보드', href: '/dashboard' },
              { label: project?.name ?? '…', href: `/projects/${projectId}` },
              { label: '설정' },
            ]}
          />
          <h1 className="mt-2 text-title-lg font-semibold sm:text-display-md">프로젝트 설정</h1>

          <section className="mt-10 space-y-2">
            <h2 className="text-title-md font-medium">이름</h2>
            <p className="text-body-sm text-muted-foreground">
              대시보드 목록과 페이지 편집 화면에 표시됩니다.
            </p>
            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <Input
                value={nameDraft ?? project?.name ?? ''}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveName();
                }}
                disabled={!project || busy}
                aria-label="프로젝트 이름"
                className="flex-1"
              />
              <Button
                onClick={saveName}
                disabled={!project || busy || nameDraft === null}
                className="shrink-0"
              >
                이름 저장
              </Button>
            </div>
          </section>

          <section className="mt-10 space-y-2">
            <h2 className="text-title-md font-medium">기본 AI 서비스</h2>
            <p className="text-body-sm text-muted-foreground">
              이 프로젝트에서 그림을 만들 때 처음 선택되는 서비스입니다. 컷마다 따로 바꿀 수
              있습니다.
            </p>
            <div className="pt-2">
              <Select
                value={project?.defaultModel ?? NO_MODEL}
                disabled={!project || busy}
                onValueChange={async (v) => {
                  const next = v === NO_MODEL ? null : (v as ModelId);
                  if (await patch({ defaultModel: next }, '설정을 저장')) {
                    toast.push('success', '기본 AI 서비스를 변경했습니다.');
                  }
                }}
              >
                <SelectTrigger className="sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MODEL}>따로 지정 안 함 (Gemini)</SelectItem>
                  {MODEL_OPTIONS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="mt-10 space-y-2">
            <h2 className="text-title-md font-medium">설정집</h2>
            <p className="text-body-sm text-muted-foreground">
              등장인물·배경·세계관·그림체를 등록해 두면 여러 컷에 걸쳐 같은 모습으로 그려집니다.
            </p>
            <Link
              href={`/projects/${projectId}/consistency`}
              className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/40 touch:min-h-11"
            >
              <span className="text-body-sm font-medium">설정집</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </section>

          <section className="mt-14 space-y-2 rounded-lg border border-destructive/40 p-4">
            <h2 className="text-title-md font-medium text-destructive">프로젝트 삭제</h2>
            <p className="text-body-sm text-muted-foreground">
              페이지와 생성한 그림이 모두 사라집니다. 되돌릴 수 없습니다.
            </p>
            <Button
              variant="destructive"
              onClick={remove}
              disabled={!project || busy}
              className="mt-2"
            >
              이 프로젝트 삭제
            </Button>
          </section>
        </div>
      </PageContainer>
    </AppShell>
  );
}
