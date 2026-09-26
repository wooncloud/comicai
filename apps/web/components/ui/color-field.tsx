'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Pipette } from 'lucide-react';
import { cn } from '@/lib/cn';
import { hexToHsv, hsvToHex, isNearWhite, normalizeHex, type Hsv } from '@/lib/color';
import { clamp } from '@/lib/math';

/**
 * 만화에 쓰는 색 한 벌.
 *
 * 무채색 한 줄, 따뜻한 색 한 줄, 차가운 색 한 줄. 컷 테두리는 거의 검정이고
 * 말풍선은 흰색·미색이라 첫 줄이 가장 많이 쓰인다 — 그래서 맨 위에 둔다.
 *
 * 아무 색이나 집게 하는 것보다 **고를 값을 정해 주는 편**이 결과가 낫다. 한 페이지
 * 안에서 서로 어울리는 색만 모아 두었다.
 */
const PRESETS: readonly (readonly string[])[] = [
  ['#ffffff', '#f5f5f5', '#e5e5e5', '#c8c8c8', '#9a9a9a', '#6b6b6b', '#3a3a3a', '#000000'],
  ['#fff1e0', '#ffe066', '#f59f00', '#ffb26b', '#f76f53', '#e03131', '#c2255c', '#7a3e2f'],
  ['#e7f5ff', '#a5d8ff', '#4dabf7', '#1c7ed6', '#3b5bdb', '#7048e8', '#38d9a9', '#2b8a3e'],
];

interface Props {
  value: string;
  /**
   * 색이 정해졌을 때 — 견본을 눌렀을 때, hex 를 확정했을 때(Enter·포커스 이동), 직접 고르기
   * 판·띠에서 **손을 뗐을 때.**
   */
  onChange: (v: string) => void;
  /**
   * 판·띠를 끄는 동안에도 부른다. 캔버스 도형처럼 **바꿔도 저장이 늦게 나가는** 대상만 켠다 —
   * 곧장 요청을 보내는 곳(페이지 배경)에서 켜면 판을 한 번 끌 때 요청이 수십 개 나간다.
   */
  live?: boolean;
  ariaLabel: string;
}

/**
 * 색 고르개 — 팔레트를 **속성 창에 펼쳐 두고**, 맨 끝 줄에서 hex 를 넣거나 직접 고른다.
 *
 * **왜 `<input type="color">` 를 안 쓰나.** 그건 OS 색상 선택 창을 띄우는데, 창이 앱
 * 밖에 떠서 어떤 칸을 고치는 중인지 잃어버리고, 화면마다 생김새가 다르며, 무엇보다
 * **아무 색이나 고르게 한다** — 한 페이지 안에서 어울리지 않는 색이 섞이는 가장 빠른 길이다.
 *
 * **왜 펼쳐 두나.** 처음에는 그 자리에서 아래로 펼쳤다가(아래 항목이 밀려났다), 그다음에는
 * 팝오버로 띄웠다. 팝오버는 색 하나 바꾸는 데 열고·고르고·닫는 세 번이 들었고, 지금 무슨
 * 색들 사이에서 고르는지가 늘 가려져 있었다. 견본을 작게 해 한 번에 보이게 두니 누르면 끝난다.
 *
 * **직접 고르기**(채도판·색상 띠)는 끝 줄의 버튼으로 그 자리에서 펼친다. 늘 펼쳐 두면 색칸이
 * 셋인 말풍선 메뉴가 너무 길어진다. 팔레트를 펼치며 한때 뺐다가 되살렸다 — hex 만으로는
 * "조금 더 밝게" 같은 고르기를 할 수 없다.
 */
export function ColorField({ value, onChange, live = false, ariaLabel }: Props) {
  const [draft, setDraft] = useState(value);
  const [picking, setPicking] = useState(false);
  useEffect(() => setDraft(value), [value]);

  const current = normalizeHex(value) ?? '#000000';

  function commit(next: string) {
    const n = normalizeHex(next);
    if (!n) {
      setDraft(value);
      return;
    }
    setDraft(n);
    if (n !== current) onChange(n);
  }

  /** 판·띠를 끄는 중. 보이는 값만 바꾸고, live 일 때만 올려 보낸다. */
  function drag(hex: string) {
    if (live) commit(hex);
    else setDraft(hex);
  }

  return (
    <div className="space-y-1" role="group" aria-label={ariaLabel}>
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
                className={cn(
                  'relative h-6 min-w-0 flex-1 rounded-sm outline-none ring-offset-1 ring-offset-card focus-visible:ring-2 focus-visible:ring-ring',
                  active && 'ring-2 ring-foreground',
                )}
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

      {/* 맨 끝 줄 — 지금 색, hex, 직접 고르기. 팔레트에 없는 색은 여기서 넣는다. */}
      <div className="flex items-center gap-1.5 pt-0.5">
        <Swatch
          color={normalizeHex(draft) ?? current}
          className="h-7 w-7 shrink-0 rounded border border-border"
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
            else if (e.key === 'Escape') setDraft(value);
          }}
          spellCheck={false}
          placeholder="#000000"
          className="h-7 min-w-0 flex-1 rounded border border-border bg-card px-2 font-mono text-caption"
          aria-label={`${ariaLabel} (hex)`}
        />
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          aria-label={`${ariaLabel} 직접 고르기`}
          title="직접 고르기"
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors',
            picking
              ? 'border-foreground bg-muted text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <Pipette className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {picking && <CustomPicker value={current} onDrag={drag} onDone={commit} />}
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
 *
 * 끄는 동안은 `onDrag`, 손을 떼면 `onDone` 한 번. 굵기 손잡이와 같은 규칙이다 — 판은
 * 포인터가 움직일 때마다 값이 나오므로, 그대로 저장하면 1초에 수십 번 저장된다.
 * 방향키는 `keyup`, 그 밖의 경우는 `blur` 가 끝이다.
 */
function CustomPicker({
  value,
  onDrag,
  onDone,
}: {
  value: string;
  onDrag: (hex: string) => void;
  onDone: (hex: string) => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value) ?? { h: 0, s: 0, v: 0 });
  /** 손을 뗄 때 보낼 값. 마지막 이동과 pointerup 사이에 렌더가 없을 수 있어 ref 로 든다. */
  const latest = useRef(hsv);
  useEffect(() => {
    latest.current = hsv;
  }, [hsv]);

  function move(next: Hsv) {
    latest.current = next;
    setHsv(next);
    onDrag(hsvToHex(next));
  }
  const done = () => onDone(hsvToHex(latest.current));

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
    const s = clamp((e.clientX - r.left) / r.width, 0, 1);
    const v = 1 - clamp((e.clientY - r.top) / r.height, 0, 1);
    move({ ...hsv, s, v });
  }

  return (
    <div className="space-y-2 pt-1">
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
        onPointerUp={done}
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
        onChange={(e) => move({ ...hsv, h: Number(e.target.value) })}
        onPointerUp={done}
        onKeyUp={done}
        onBlur={done}
        className="hue-slider h-3 w-full cursor-pointer appearance-none rounded-full"
        style={{
          background:
            'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
        }}
      />
    </div>
  );
}
