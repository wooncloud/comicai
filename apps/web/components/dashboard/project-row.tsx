'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { ApiPaths, type ProjectDTO } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/error-message';
import { useConfirm } from '@/components/ui/confirm';

interface Props {
  project: ProjectDTO;
  onPatched: (p: ProjectDTO) => void;
  onRemoved: (id: string) => void;
}

/**
 * 대시보드 프로젝트 목록의 한 행.
 *
 * 예전에는 4:3 썸네일이 있는 카드였다. 그런데 썸네일이 없는 프로젝트에서는
 * 카드 면적의 대부분이 이니셜 두 글자만 띄운 빈 사각형이었고, 한 화면에 들어가는
 * 프로젝트 수도 크게 줄었다. 훑어보고 고르는 화면이라 밀도가 더 중요하다.
 *
 * 썸네일을 아예 버리지는 않았다. 서버가 프로젝트 썸네일이 없으면 첫 페이지 배경을
 * 폴백으로 내려주므로(apps/api/src/projects/projects.service.ts 의 withThumbnailUrl),
 * 한 번이라도 렌더한 프로젝트에는 실제 그림이 있다. 행 왼쪽 작은 슬롯으로 남긴다.
 *
 * 이름 변경·썸네일·삭제는 상시 보이는 `⋯` 메뉴에 있다. 예전에는 hover 로만 드러나서
 * 터치 기기에서는 **영원히 보이지 않는데 탭은 먹는** 버튼이었다.
 */
export function ProjectRow({ project, onPatched, onRemoved }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = draft !== null;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const thumbUrl = project.thumbnailUrl ?? null;

  async function save() {
    // Enter 는 버튼의 disabled 를 거치지 않는다. 연타하면 PATCH 가 두 번 나가고
    // 성공 토스트도 두 번 떴다. 가드를 함수 안에 둔다 — 진입점이 둘이기 때문이다.
    if (busy) return;
    const name = draft?.trim() ?? '';
    if (!name || name === project.name) {
      setDraft(null);
      return;
    }
    setBusy(true);
    try {
      const updated = await api<ProjectDTO>(ApiPaths.project(project.id), {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      onPatched(updated);
      setDraft(null);
      toast.push('success', '프로젝트 이름을 변경했습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '이름을 변경'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !(await confirm({
        title: `'${project.name}' 프로젝트를 삭제할까요?`,
        body: '이 프로젝트의 페이지·컷·말풍선과 만든 그림이 모두 사라집니다. 되돌릴 수 없습니다.',
        confirmLabel: '삭제',
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    try {
      await api(ApiPaths.project(project.id), { method: 'DELETE' });
      onRemoved(project.id);
      toast.push('success', '프로젝트를 삭제했습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '프로젝트를 삭제'));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const updated = await api<ProjectDTO>(ApiPaths.projectThumbnail(project.id), {
        method: 'POST',
        body: fd,
      });
      onPatched(updated);
      toast.push('success', '표지를 변경했습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '표지를 변경'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
      {editing ? (
        <>
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') setDraft(null);
            }}
            aria-label="프로젝트 이름"
            className="min-w-0 flex-1"
          />
          <Button size="sm" className="shrink-0" onClick={save} disabled={busy}>
            저장
          </Button>
          <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setDraft(null)}>
            취소
          </Button>
        </>
      ) : (
        <>
          <Link
            href={`/projects/${project.id}`}
            className="flex min-w-0 flex-1 items-center gap-3 py-1"
          >
            <span className="flex h-10 w-[3.25rem] shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-caption font-semibold text-muted-foreground/70">
              {thumbUrl ? (
                <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                project.name.slice(0, 2)
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-medium">{project.name}</span>
              <span className="mt-0.5 block text-caption text-muted-foreground">
                {new Date(project.updatedAt).toLocaleDateString('ko-KR')} 수정
              </span>
            </span>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={`${project.name} 메뉴`}
                className="shrink-0 px-2"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setDraft(project.name)}>이름 변경</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                표지 변경
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/projects/${project.id}/settings`}>프로젝트 설정</Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onSelect={remove}>
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onFile}
      />
    </li>
  );
}
