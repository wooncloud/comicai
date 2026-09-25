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
          const rest = line.slice(breakAt);
          line = rest + ch;
          width = 0;
          for (const c of line) width += charWidthEm(c);
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
    void breakWidth;
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
 * 타원은 모서리가 둥글어 가로폭을 그대로 쓰면 글자가 선 밖으로 나간다. 내접 사각형은
 * w/√2 지만 그러면 너무 좁아 보여서, 실제로 그려 보고 0.78 / 0.62 로 잡았다.
 */
export function bubbleTextBox(
  variant: string,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  const [fw, fh] = variant === 'rect' ? [0.88, 0.82] : [0.78, 0.62];
  const bw = w * fw;
  const bh = h * fh;
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
}
