/**
 * 말풍선 대사의 줄바꿈.
 *
 * **캔버스와 export 가 같은 함수를 써야 한다.** export 는 sharp(librsvg)로 SVG 를 굽는데
 * librsvg 는 `foreignObject` 를 모른다 — 즉 CSS 줄바꿈을 쓸 수 없고, 줄을 직접 끊어
 * `<tspan>` 으로 넣어야 한다. 캔버스만 CSS 로 접으면 화면에서는 두 줄인데 내보낸 PNG
 * 에서는 세 줄이 되어, 풍선 밖으로 글자가 삐져나간다.
 *
 * 정확한 폰트 메트릭이 아니라 **근사**다. 브라우저의 sans-serif 와 export 컨테이너의
 * Noto CJK 는 애초에 같은 폰트가 아니라, 어느 쪽에 맞춰도 픽셀 단위로는 맞지 않는다.
 * 그래서 "같은 규칙으로 끊는다" 를 택했다 — 두 결과가 정확히 같은 지점에서 줄이 바뀐다.
 */

/** 글자 하나의 대략적인 가로 폭(em 단위). */
function charWidthEm(ch: string): number {
  // 한글·한자·가나·전각 문장부호는 정사각형에 가깝다.
  if (/[ᄀ-ᇿ⺀-〿぀-ヿ㄰-㆏㐀-䶿一-鿿가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch)) {
    return 1;
  }
  if (ch === ' ') return 0.28;
  if (/[iIl1.,;:'`!|[\]()]/.test(ch)) return 0.3;
  if (/[A-Z@%&#]/.test(ch)) return 0.68;
  if (/[mwMW]/.test(ch)) return 0.85;
  return 0.52;
}

/** 이 글자 **앞에서** 줄을 끊어도 되는가. 공백이 없는 한국어·한자도 접혀야 한다. */
function breakableBefore(ch: string): boolean {
  return /[⺀-〿぀-ヿ㄰-㆏㐀-䶿一-鿿가-힣]/.test(ch);
}

/** 줄 끝에 남으면 어색한 여는 괄호류 — 여기서 끊지 않는다. */
const NO_BREAK_BEFORE = /[.,;:!?)\]}」』】〉》…%]/;

/**
 * 줄 높이(글자 크기의 배수). 캔버스의 CSS `line-height` 와 export 의 `<tspan>` 간격이
 * 같은 값이어야 한다 — 다르면 여러 줄 대사의 세로 위치가 화면과 결과물에서 갈린다.
 */
export const TEXT_LINE_HEIGHT = 1.25;

export interface WrapTextOptions {
  /** 글자가 들어갈 수 있는 가로 폭(px). */
  maxWidth: number;
  fontSize: number;
}

/**
 * 글을 `maxWidth` 안에 들어가도록 줄로 끊는다.
 *
 * - 사용자가 넣은 `\n` 은 항상 지킨다.
 * - 라틴 문자는 단어(공백) 단위로, 한국어·한자는 글자 단위로 끊는다.
 * - 한 글자가 폭보다 넓으면 그 글자는 혼자 한 줄을 차지한다(무한 루프 방지).
 */
export function wrapText(text: string, { maxWidth, fontSize }: WrapTextOptions): string[] {
  if (!text) return [];
  const limit = Math.max(1, maxWidth) / Math.max(1, fontSize); // em 단위로 비교
  const out: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('');
      continue;
    }
    let line = '';
    let width = 0;
    /** 마지막으로 줄을 끊을 수 있었던 자리(line 안의 인덱스)와 그때까지의 폭. */
    let breakAt = -1;
    let breakWidth = 0;

    for (const ch of paragraph) {
      const w = charWidthEm(ch);
      if (width + w > limit && line !== '') {
        if (breakAt > 0) {
          out.push(line.slice(0, breakAt).trimEnd());
          // 끊은 자리 뒤에 남은 폭 = 지금 폭 − 끊은 자리까지의 폭.
          line = line.slice(breakAt) + ch;
          width = width - breakWidth + w;
        } else {
          out.push(line);
          line = ch;
          width = w;
        }
        breakAt = -1;
        breakWidth = 0;
        continue;
      }
      line += ch;
      width += w;
      // 다음 글자 앞에서 끊을 수 있는 자리 기록
      if (ch === ' ' || breakableBefore(ch)) {
        breakAt = line.length;
        breakWidth = width;
      }
    }
    if (line !== '') out.push(line);
  }
  // 닫는 문장부호가 줄 맨 앞에 떨어지면 앞 줄로 끌어올린다.
  for (let i = 1; i < out.length; i += 1) {
    const cur = out[i];
    const prev = out[i - 1];
    if (cur && prev && NO_BREAK_BEFORE.test(cur[0] ?? '')) {
      out[i - 1] = prev + cur[0];
      out[i] = cur.slice(1);
    }
  }
  return out.filter((l, i) => l !== '' || i < out.length - 1);
}

/**
 * 말풍선 안에서 글자가 쓸 수 있는 영역.
 *
 * 풍선 모양마다 "선 안쪽" 이 다르다. 한 값으로 뭉뚱그리면 뾰족 풍선에서 글자가
 * 가시를 넘어간다 — 2026-09-25 에 네 종류를 나란히 그려 보고 실제로 그랬다.
 *
 * - `rect` 는 모서리만 둥글어 거의 다 쓴다.
 * - `ellipse` 에 꼭 맞는 사각형은 `w/√2`(0.707)지만, 줄이 세로 가운데에 모이므로
 *   가장 넓은 허리께를 쓴다. 조금 여유를 둔 값이다.
 * - `spike` 는 가시의 안쪽 반지름이 바깥의 0.7 배다(`bubble-path.ts` 의 `rInnerFactor`).
 *   그 타원에 내접하는 사각형이라 0.7 × 0.707 ≈ 0.49 다.
 * - `polygon` 은 모양을 모르니 **꼭짓점에서 직접 구한다** — 각 꼭짓점을 중심 쪽으로
 *   당긴 다각형의 bbox 다. 볼록한 도형에서는 항상 안쪽이다.
 */
const TEXT_BOX_FACTORS: Record<string, [number, number]> = {
  rect: [0.88, 0.82],
  ellipse: [0.74, 0.62],
  spike: [0.49, 0.45],
  polygon: [0.62, 0.56],
};

/** 다각형 꼭짓점을 중심 쪽으로 당길 비율. */
const POLYGON_INSET = 0.62;

export function bubbleTextBox(
  variant: string,
  w: number,
  h: number,
  points?: readonly { x: number; y: number }[] | null,
): { x: number; y: number; w: number; h: number } {
  if (variant === 'polygon' && points && points.length >= 3) {
    const cx = points.reduce((a, p) => a + p.x, 0) / points.length;
    const cy = points.reduce((a, p) => a + p.y, 0) / points.length;
    const xs = points.map((p) => cx + (p.x - cx) * POLYGON_INSET);
    const ys = points.map((p) => cy + (p.y - cy) * POLYGON_INSET);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    return {
      x: x0 * w,
      y: y0 * h,
      w: Math.max(1, (Math.max(...xs) - x0) * w),
      h: Math.max(1, (Math.max(...ys) - y0) * h),
    };
  }
  const [fw, fh] = TEXT_BOX_FACTORS[variant] ?? TEXT_BOX_FACTORS.ellipse!;
  const bw = w * fw;
  const bh = h * fh;
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
}
