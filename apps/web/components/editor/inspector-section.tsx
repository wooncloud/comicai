'use client';
import type { LucideIcon } from 'lucide-react';

/**
 * 인스펙터 안의 한 구역.
 *
 * 예전에는 구역 제목(`SectionLabel`)과 입력들이 같은 흐름에 세로로 쭉 이어졌다.
 * 말풍선 인스펙터를 열면 채움·선·꼬리·폰트·정렬·크기·글자 색·순서가 **경계 없이**
 * 한 줄기로 흘러, 어디까지가 '말풍선' 이고 어디부터가 '대사' 인지 매번 읽어 봐야 했다.
 *
 * 탭으로 가르지 않은 이유: 구역이 두세 개뿐이고 서로 같이 보면서 맞추는 값들이다
 * (풍선 색을 고르면서 글자 색을 본다). 탭은 그 둘을 동시에 못 보게 만든다.
 * 대신 **테두리와 제목 줄**로 눈에 보이는 경계를 준다.
 */
export function InspectorSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    // shrink-0: 속성 창은 세로 flex + 스크롤이다. overflow-hidden 인 flex 항목은 최소 높이가 0 이
    // 되어, 내용이 창보다 길면 스크롤 대신 구역이 찌그러지며 아래가 잘렸다(말풍선의 '꼬리 달기').
    <section className="shrink-0 overflow-hidden rounded-md border border-border">
      <h3 className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2 text-caption font-semibold text-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {title}
      </h3>
      <div className="space-y-2.5 p-3">{children}</div>
    </section>
  );
}

/**
 * 구역 안의 한 줄 — 라벨 위, 입력 아래.
 *
 * 라벨을 왼쪽에 두지 않는 이유: 폭 320px 인스펙터에서 라벨이 가로를 먹으면 색 칸과
 * 숫자 칸이 서로 밀려 줄마다 폭이 달라진다. 위에 두면 입력이 항상 같은 폭이다.
 */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-caption text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
