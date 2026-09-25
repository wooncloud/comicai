'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Pipette } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
import { hexToHsv, hsvToHex, isNearWhite, normalizeHex, type Hsv } from '@/lib/color';

/**
 * 만화에 쓰는 색 한 벌.
 *
 * 무채색 한 줄, 따뜻한 색 한 줄, 차가운 색 한 줄. 컷 테두리는 거의 검정이고
 * 말풍선은 흰색·미색이라 첫 줄이 가장 많이 쓰인다 — 그래서 맨 위에 둔다.
 *
 * 스포이드로 아무 색이나 집게 하는 것보다 **고를 값을 정해 주는 편**이 결과가
 * 낫다. 한 페이지 안에서 서로 어울리는 색만 모아 두었다.
 */
const PRESETS: readonly (readonly string[])[] = [
  ['#ffffff', '#f5f5f5', '#e5e5e5', '#c8c8c8', '#9a9a9a', '#6b6b6b', '#3a3a3a', '#000000'],
  ['#fff1e0', '#ffe066', '#f59f00', '#ffb26b', '#f76f53', '#e03131', '#c2255c', '#7a3e2f'],
  ['#e7f5ff', '#a5d8ff', '#4dabf7', '#1c7ed6', '#3b5bdb', '#7048e8', '#38d9a9', '#2b8a3e'],
];

interface Props {
  value: string;
  /** 확정된 색만 올라온다. 손잡이를 끄는 동안에는 부르지 않는다. */
  onCommit: (v: string) => void;
  ariaLabel: string;
  /** 인스펙터(카드 배경) 위인가. 입력칸 배경을 주변과 맞춘다. */
  variant?: 'page' | 'panel';
}

/**
 * 색 고르개 — 프리셋 한 벌이 먼저, 직접 고르기는 그 아래.
 *
 * **왜 `<input type="color">` 를 안 쓰나.** 그건 OS 색상 선택 창을 띄우는데,
 * 창이 앱 밖에 떠서 어떤 칸을 고치는 중인지 잃어버리고, 화면마다 생김새가 다르며,
 * 무엇보다 **아무 색이나 고르게 한다** — 한 페이지 안에서 서로 어울리지 않는 색이
 * 섞이는 가장 빠른 길이다. 쓸 만한 색을 먼저 내밀고, 그래도 없으면 직접 집는다.
 *
 * **팝오버로 띄운다.** 처음에는 그 자리에서 아래로 펼쳤는데, 폭 320px 인스펙터에서
 * 팔레트가 펼쳐지면 아래 항목들이 한 화면 밖으로 밀려났다 — 색을 고르는 동안 굵기도
 * 정렬도 보이지 않는다. 떠 있는 패널은 인스펙터 **왼쪽**(캔버스 위)으로 나가므로
 * 목록이 그대로 있고, 패널 폭도 인스펙터에 묶이지 않는다.
 */
export function ColorField({ value, onCommit, ariaLabel, variant = 'page' }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const current = normalizeHex(value) ?? '#000000';
  const bg = variant === 'panel' ? 'bg-card' : 'bg-background';

  function commit(next: string) {
    const n = normalizeHex(next);
    if (!n) {
      setDraft(value);
      return;
    }
    setDraft(n);
    if (n !== current) onCommit(n);
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            title={ariaLabel}
            className={cn(
              'h-8 w-10 shrink-0 rounded border p-0.5 transition-colors',
              open ? 'border-foreground' : 'border-border hover:border-foreground/40',
              bg,
            )}
          >
            <Swatch color={current} className="h-full w-full rounded-sm" />
          </button>
        </PopoverTrigger>
        {/*
          인스펙터가 화면 오른쪽 끝이라 왼쪽으로 낸다. 폭은 팔레트 여덟 칸이
          손가락으로 누를 만한 크기가 되도록 잡았다.
        */}
        <PopoverContent side="left" align="start" className="w-64 space-y-3">
          <div className="space-y-1">
            {PRESETS.map((row, i) => (
              <div key={i} className="flex gap-1">
                {row.map((hex) => {
                  const active = hex === current;
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => commit(hex)}
                      aria-label={hex}
                      aria-pressed={active}
                      title={hex}
                      className="relative h-6 flex-1 rounded-sm outline-none ring-offset-1 ring-offset-popover focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Swatch color={hex} className="h-full w-full rounded-sm" />
                      {active && (
                        <Check
                          className={cn(
                            'absolute inset-0 m-auto h-3.5 w-3.5',
                            isNearWhite(hex) ? 'text-foreground' : 'text-white',
                          )}
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <CustomPicker value={current} onPick={commit} />
        </PopoverContent>
      </Popover>

      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          else if (e.key === 'Escape') setDraft(value);
        }}
        className={cn(
          'h-8 min-w-0 flex-1 rounded border border-border px-2 font-mono text-caption',
          bg,
        )}
        aria-label={`${ariaLabel} (hex)`}
      />
    </div>
  );
}

/**
 * 색 한 칸.
 *
 * 흰색에 가까우면 테두리를 두른다 — 안 그러면 흰 바탕에서 **빈 칸**으로 보인다.
 *
 * `block` 이 빠지면 안 된다. `<span>` 은 기본이 inline 이라 높이·너비를 아예
 * 무시하고, 견본이 **한 칸도 안 보이는** 팔레트가 된다.
 */
function Swatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn('block', className, isNearWhite(color) && 'ring-1 ring-inset ring-border')}
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * 직접 고르기 — 채도·밝기 판과 색상 띠.
 *
 * 색상 띠를 `<input type="range">` 로 둔 이유: 방향키로 조절되고 스크린 리더가
 * 읽는다. 판은 그렇게 만들 수 없어 포인터로 집되, 띠에서 색상을 먼저 정하면
 * 키보드만으로도 원하는 계열까지는 닿는다.
 */
function CustomPicker({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value) ?? { h: 0, s: 0, v: 0 });

  /*
   * 밖에서 색이 바뀌면(프리셋을 눌렀을 때 등) 따라간다.
   *
   * 판을 끄는 동안 올라간 값이 그대로 되돌아오는데, hex 는 8비트라 HSV 로
   * 되돌리면 손끝 위치가 미세하게 튄다. 그래서 **이 고르개가 만든 색과 같으면
   * 건드리지 않는다** — 끄는 동안 점이 손가락을 따라오지 못하던 원인이었다.
   */
  useEffect(() => {
    setHsv((prev) => (hsvToHex(prev) === value ? prev : (hexToHsv(value) ?? prev)));
  }, [value]);

  function pickFromPointer(e: React.PointerEvent<HTMLDivElement>) {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return;
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const next = { ...hsv, s, v };
    setHsv(next);
    onPick(hsvToHex(next));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-caption text-muted-foreground">
        <Pipette className="h-3 w-3" aria-hidden />
        직접 고르기
      </div>
      <div
        ref={areaRef}
        role="presentation"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pickFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) pickFromPointer(e);
        }}
        className="relative h-24 w-full cursor-crosshair rounded"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
        }}
      >
        <span
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={359}
        value={Math.round(hsv.h)}
        aria-label="색상"
        onChange={(e) => {
          const next = { ...hsv, h: Number(e.target.value) };
          setHsv(next);
          onPick(hsvToHex(next));
        }}
        className="hue-slider h-3 w-full cursor-pointer appearance-none rounded-full"
        style={{
          background:
            'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
        }}
      />
    </div>
  );
}
