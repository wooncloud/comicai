'use client';
import type { ReactNode } from 'react';
import { usePanelWidth, type PanelWidthSpec } from '@/lib/use-panel-width';
import { ResizeHandle } from './resize-handle';

interface Props {
  /** 폭을 남겨 둘 localStorage 키. */
  storageKey: string;
  spec: PanelWidthSpec;
  /** 패널이 캔버스의 어느 쪽인가. 손잡이는 캔버스 쪽 경계에 붙는다. */
  side: 'left' | 'right';
  /** 경계 손잡이의 이름(스크린 리더). */
  label: string;
  children: ReactNode;
}

/**
 * 끌어서 폭을 정하는 사이드 패널 하나 — 내용과 경계 손잡이. 에디터의 세 패널(페이지 목록·
 * 도구·속성)이 쓴다. 예전에는 라우트가 `<div style={{width}}>` 와 손잡이 짝을 세 벌 적었다.
 *
 * **폭은 여기서 든다.** 라우트가 들고 있던 때는 경계를 끄는 동안 라우트 전체(상단바·
 * 사이드바·인스펙터)가 포인터 속도로 다시 그려졌다. 여기 두면 다시 그려지는 것은 이
 * 껍데기뿐이다 — 안의 내용은 라우트가 만든 요소 그대로라 React 가 건너뛴다.
 */
export function SidePanel({ storageKey, spec, side, label, children }: Props) {
  const { width, hidden, resize } = usePanelWidth(storageKey, spec);
  const panel = hidden ? null : (
    <div style={{ width }} className="flex min-w-0 shrink-0">
      {children}
    </div>
  );
  const handle = (
    <ResizeHandle side={side} label={label} width={width} spec={spec} onResize={resize} />
  );
  return side === 'left' ? (
    <>
      {panel}
      {handle}
    </>
  ) : (
    <>
      {handle}
      {panel}
    </>
  );
}
