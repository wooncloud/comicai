'use client';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isNearWhite, normalizeHex } from '@/lib/color';

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
  /** 색이 정해졌을 때 — 견본을 눌렀을 때, 또는 hex 를 확정했을 때(Enter·포커스 이동). */
  onChange: (v: string) => void;
  ariaLabel: string;
}

/**
 * 색 고르개 — 팔레트를 **속성 창에 펼쳐 두고**, 맨 끝 줄에서 hex 를 직접 넣는다.
 *
 * **왜 `<input type="color">` 를 안 쓰나.** 그건 OS 색상 선택 창을 띄우는데, 창이 앱
 * 밖에 떠서 어떤 칸을 고치는 중인지 잃어버리고, 화면마다 생김새가 다르며, 무엇보다
 * **아무 색이나 고르게 한다** — 한 페이지 안에서 어울리지 않는 색이 섞이는 가장 빠른 길이다.
 *
 * **왜 펼쳐 두나.** 처음에는 그 자리에서 아래로 펼쳤다가(아래 항목이 밀려났다), 그다음에는
 * 팝오버로 띄웠다. 팝오버는 색 하나 바꾸는 데 열고·고르고·닫는 세 번이 들었고, 지금 무슨
 * 색들 사이에서 고르는지가 늘 가려져 있었다. 견본을 작게 해 한 번에 보이게 두니 누르면 끝난다.
 * 채도판·색상 띠(직접 고르기)는 팝오버 안에 있던 것이라 함께 빠졌다 — hex 가 그 몫을 한다.
 */
export function ColorField({ value, onChange, ariaLabel }: Props) {
  const [draft, setDraft] = useState(value);
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

      {/* 맨 끝 줄 — 지금 색과 hex. 팔레트에 없는 색은 여기서 넣는다. */}
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
      </div>
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
