'use client';
import { CollapseButton } from './collapse-button';

interface Props {
  /** 대문자 라벨. 무엇을 선택했는지. */
  title: string;
  /** 라벨 오른쪽에 붙는 것(상태 배지 등). */
  badge?: React.ReactNode;
  onCollapse?: () => void;
  children: React.ReactNode;
}

/**
 * 오른쪽 속성 창의 껍데기.
 *
 * 다섯 인스펙터(컷·말풍선·텍스트·직선·페이지)가 같은 `<aside>` 와 헤더를 각자
 * 적고 있었는데, **폭이 `w-96`/`w-80`×3/`w-72` 로 갈려 있었다.** 그래서 컷에서
 * 말풍선으로, 다시 페이지로 선택을 옮길 때마다 캔버스 폭이 튀었다. 페이지
 * 인스펙터만 `min-h-0` 도 빠져 있어서 내용이 길면 스크롤 대신 늘어났다.
 *
 * 폭은 `w-80` 으로 통일한다 — 다섯 중 셋이 이미 그 값이었다.
 */
export function InspectorShell({ title, badge, onCollapse, children }: Props) {
  return (
    <aside className="flex min-h-0 w-80 flex-col gap-4 overflow-y-auto border-l border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        {onCollapse && <CollapseButton side="right" onClick={onCollapse} title="속성 창 접기" />}
        <div className="flex-1 truncate text-xs uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
        {badge}
      </div>
      {children}
    </aside>
  );
}
