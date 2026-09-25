'use client';
import { Button } from '@/components/ui/button';

interface Props {
  /** 대문자 라벨. 무엇을 선택했는지. */
  title: string;
  /** 라벨 오른쪽에 붙는 것(상태 배지 등). */
  badge?: React.ReactNode;
  /**
   * 있으면 맨 아래에 삭제 버튼이 붙는다.
   *
   * 여기 모은 이유: Delete 키로 지울 수는 있었지만 **버튼이 컷에만 있었다.** 말풍선을
   * 고르고 인스펙터를 훑은 사람은 지우는 방법이 없다고 읽는다 — 키보드 단축키는
   * 화면 어디에도 적혀 있지 않았다. 자리도 인스펙터마다 다르면 매번 찾아야 한다.
   */
  onDelete?: () => void;
  /** 삭제 버튼 문구. 무엇이 지워지는지 그대로 적는다("컷 삭제"). */
  deleteLabel?: string;
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
 * 폭은 이제 **부모가 정한다.** 사용자가 경계를 끌어 맞추므로(`use-panel-width.ts`),
 * 여기서 고정 폭을 박으면 그 조절이 무시된다. 접기 버튼도 그 손잡이로 대체됐다.
 */
export function InspectorShell({ title, badge, onDelete, deleteLabel, children }: Props) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto border-l border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 truncate text-xs uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
        {badge}
      </div>
      {children}
      {onDelete && (
        <div className="mt-auto border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {deleteLabel ?? '삭제'}
          </Button>
        </div>
      )}
    </aside>
  );
}
