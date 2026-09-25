'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, BookMarked } from 'lucide-react';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import {
  ApiPaths,
  ENTITY_TYPE_LABEL,
  type ConsistencyEntityDTO,
  type EntityType,
} from '@comicai/types';

const TYPES: EntityType[] = ['style', 'character', 'background', 'worldview'];

/**
 * 프로젝트 화면 맨 위의 설정집 요약.
 *
 * **왜 여기 있나.** 설정집은 설정이 아니라 작품의 재료다 — 캐릭터를 등록해야 컷에서
 * `@` 로 부를 수 있고, 그림체를 정해야 컷이 일관되게 나온다. 그런데 예전에는
 * 프로젝트 → 프로젝트 설정 → 설정집으로 두 단계 안에 묻혀 있어서, 처음 들어온
 * 사람은 그런 게 있는 줄도 몰랐다.
 *
 * 링크만 두지 않고 갈래별 개수와 이름을 같이 보여 준다. 그래야 들어가 보지 않고도
 * "캐릭터는 등록했고 배경이 비었다" 를 안다.
 */
export function SettingBookSummary({ projectId }: { projectId: string }) {
  const { data: items } = useQuery<ConsistencyEntityDTO[]>({
    queryKey: qk.consistency(projectId),
    queryFn: () => api<ConsistencyEntityDTO[]>(ApiPaths.projectConsistency(projectId)),
    enabled: !!projectId,
    // 이 줄 하나를 못 읽었다고 프로젝트 화면 전체를 오류로 바꾸지 않는다.
    // 페이지 목록은 멀쩡히 보여야 한다.
    throwOnError: false,
  });

  return (
    <section className="mt-8 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-body-sm font-medium">
          <BookMarked className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          설정집
        </h2>
        <Link
          href={`/projects/${projectId}/consistency`}
          className="flex shrink-0 items-center gap-0.5 text-caption text-muted-foreground transition-colors hover:text-foreground"
        >
          모두 보기
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <ul className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
        {TYPES.map((type) => (
          <li key={type} className="border-b border-border last:border-b-0 sm:border-b-0">
            <Link
              href={`/projects/${projectId}/consistency?type=${type}`}
              className="flex h-full flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-muted/40 touch:min-h-11"
            >
              <span className="text-caption text-muted-foreground">{ENTITY_TYPE_LABEL[type]}</span>
              <Names items={items} type={type} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 한 줄에 몇 개까지 이름을 보일지. 나머지는 개수로 접는다. */
const SHOWN = 3;

/**
 * 등록된 이름들.
 *
 * **쉼표로 이은 한 줄이 아니라 배지다.** 한 줄로 이으면 어디서 하나가 끝나고 다음이
 * 시작하는지 눈으로 세어야 하고, 넘치면 `truncate` 가 마지막 이름을 반 토막 낸 채
 * `…` 로 끝난다 — 몇 개가 더 있는지도, 잘린 게 이름인지 아닌지도 알 수 없다.
 *
 * 그래서 `…` 대신 **`+N`** 이다. "세 개가 더 있다" 는 셀 수 있는 정보다.
 */
function Names({ items, type }: { items: ConsistencyEntityDTO[] | undefined; type: EntityType }) {
  // 아직 못 읽었을 때 "없음" 으로 보이면 등록한 것을 잃은 줄 안다.
  if (!items) return <span className="text-body-sm text-muted-foreground">…</span>;

  const of = items.filter((i) => i.type === type);
  if (of.length === 0) {
    return <span className="text-body-sm text-muted-foreground">+ 등록하기</span>;
  }

  const shown = of.slice(0, SHOWN);
  const rest = of.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1" title={of.map((i) => i.name).join(', ')}>
      {shown.map((i) => (
        <span
          key={i.id}
          className="max-w-[9rem] truncate rounded bg-muted px-1.5 py-0.5 text-caption text-foreground"
        >
          {i.name}
        </span>
      ))}
      {rest > 0 && <span className="text-caption text-muted-foreground">+{rest}</span>}
    </span>
  );
}
