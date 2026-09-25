/**
 * hex ↔ RGB ↔ HSV.
 *
 * 색 고르개(`components/ui/color-field.tsx`)만 쓴다. 저장되는 값은 언제나 hex 라,
 * HSV 는 **화면에서 손으로 집는 동안만** 존재한다.
 *
 * `@comicai/types` 에 두지 않는 이유: 서버는 색을 문자열로만 다룬다. 색상환을
 * 도는 계산은 고르개의 사정이다.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}
export interface Hsv {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  v: number;
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

export function hexToRgb(hex: string): Rgb | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  // 무채색이면 색상이 정의되지 않는다. 0 으로 두면 검정·흰색을 집었다가 채도를
  // 올릴 때 늘 빨강에서 시작하는데, 그게 가장 덜 놀라는 동작이다.
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const seg = Math.floor((((h % 360) + 360) % 360) / 60);
  const [r1, g1, b1] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[seg]!;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

export function hexToHsv(hex: string): Hsv | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsv(rgb) : null;
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv));
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
