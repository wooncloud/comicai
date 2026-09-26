/**
 * 색 고르개(`components/ui/color-field.tsx`)가 쓰는 hex 다루기.
 *
 * 채도판·색상 띠가 있던 때는 HSV 변환도 여기 있었는데, 팔레트를 펼쳐 두며 판이 빠져
 * 함께 지웠다. 저장되는 값은 언제나 hex 다.
 *
 * `@comicai/types` 에 두지 않는 이유: 서버는 색을 문자열로만 다룬다.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#abc` · `#aabbcc` · `#aabbccdd` → `#aabbcc`. 알파는 버린다 — 고르개가 다루지 않는다. */
export function normalizeHex(hex: string): string | null {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(hex.trim());
  if (!m) return null;
  const body = m[1]!;
  if (body.length === 3) {
    return `#${body
      .split('')
      .map((c) => c + c)
      .join('')}`.toLowerCase();
  }
  return `#${body.slice(0, 6)}`.toLowerCase();
}

function hexToRgb(hex: string): Rgb | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

/**
 * 이 색 위에 테두리를 그려야 하는가.
 *
 * 흰색에 가까운 견본은 흰 배경에서 사라진다 — 없는 칸처럼 보인다.
 * 밝기로 판단한다(ITU-R BT.601 가중치).
 */
export function isNearWhite(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  return (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) / 255 > 0.9;
}
