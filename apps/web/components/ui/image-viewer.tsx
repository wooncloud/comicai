'use client';
import { useCallback, useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Props {
  /** 볼 이미지들의 URL. 빈 슬롯(presign 실패 등)은 undefined 로 들어올 수 있다. */
  urls: (string | undefined)[];
  /** 열릴 때 보여 줄 이미지 index. 닫혀 있으면 null. */
  index: number | null;
  onIndexChange: (i: number | null) => void;
  /** 스크린리더용 이름. "주인공 하늘 참조 이미지" 같은 형태. */
  label: string;
}

/**
 * 이미지를 크게 보는 뷰어.
 *
 * 예전에는 썸네일이 `<a target="_blank">` 였다. 데스크톱에서는 새 탭이 열려 그럭저럭
 * 넘어갔지만, 모바일에서는 앱을 완전히 벗어나 presigned URL 만 떠 있는 화면으로
 * 이동했고 돌아오려면 뒤로 가기를 눌러야 했다. 참조 이미지를 훑어보는 동작이
 * 매번 "앱 나갔다 오기" 가 된다.
 *
 * Radix Dialog 위에 올린 이유는 Sheet 와 같다 — 포커스 트랩, Esc, 배경 스크롤 잠금이
 * 전부 필요하고 직접 만들 이유가 없다. 다만 이 뷰어는 콘텐츠가 이미지 하나뿐이라
 * `ui/dialog.tsx` 의 패딩·닫기 버튼·최대 폭이 전부 방해가 되어 따로 만들었다.
 */
export function ImageViewer({ urls, index, onIndexChange, label }: Props) {
  const open = index !== null;
  const count = urls.length;

  const go = useCallback(
    (delta: number) => {
      if (index === null || count === 0) return;
      // 끝에서 반대편으로 넘어간다. 여러 장을 훑어볼 때 끝에서 멈추면 되돌아가야 한다.
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, go]);

  const url = index === null ? undefined : urls[index];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onIndexChange(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-overlay bg-black/85 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          // 화면 전체를 쓴다. 이미지를 크게 보려고 연 창이라 여백을 둘 이유가 없다.
          className="fixed inset-0 z-dialog flex flex-col outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          aria-label={label}
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>

          <div className="flex h-14 shrink-0 items-center justify-between px-2 text-white">
            <span className="px-2 text-body-sm tabular-nums opacity-80">
              {index === null ? '' : `${index + 1} / ${count}`}
            </span>
            <DialogPrimitive.Close
              aria-label="닫기"
              className="flex h-11 w-11 items-center justify-center rounded-md opacity-80 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
            {url ? (
              // object-contain: 잘라내지 않는다. 참조 이미지는 전체 구도가 정보다.
              <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
            ) : (
              <p className="text-body-sm text-white/70">이미지를 불러오지 못했습니다.</p>
            )}

            {count > 1 && (
              <>
                <ViewerNav side="left" onClick={() => go(-1)} />
                <ViewerNav side="right" onClick={() => go(1)} />
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ViewerNav({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? '이전 이미지' : '다음 이미지'}
      className={`absolute top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white outline-none backdrop-blur transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white ${
        side === 'left' ? 'left-2' : 'right-2'
      }`}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}

/**
 * 뷰어를 여는 쪽에서 쓰는 상태 훅. `index` 와 `setIndex` 를 매번 손으로 만들지 않게.
 */
export function useImageViewer() {
  const [index, setIndex] = useState<number | null>(null);
  return { index, setIndex, open: (i: number) => setIndex(i), close: () => setIndex(null) };
}
