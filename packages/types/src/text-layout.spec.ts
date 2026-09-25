import { describe, expect, it } from 'vitest';
import { bubbleTextBox, wrapText } from './text-layout';

const opts = { maxWidth: 200, fontSize: 20 }; // 한 줄에 한글 10자쯤

describe('wrapText', () => {
  it('사용자가 넣은 줄바꿈은 그대로 지킨다', () => {
    expect(wrapText('한 줄\n두 줄', { maxWidth: 1000, fontSize: 20 })).toEqual(['한 줄', '두 줄']);
  });

  it('공백 없는 한국어도 글자 단위로 접힌다', () => {
    const lines = wrapText('가나다라마바사아자차카타파하', opts);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('가나다라마바사아자차카타파하');
  });

  it('라틴 문장은 단어 경계에서 접힌다 — 단어를 자르지 않는다', () => {
    const lines = wrapText('the quick brown fox jumps', { maxWidth: 120, fontSize: 20 });
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.startsWith(' ')).toBe(false);
    expect(lines.join(' ').replace(/\s+/g, ' ')).toBe('the quick brown fox jumps');
  });

  it('한 글자가 폭보다 넓어도 무한 루프에 빠지지 않는다', () => {
    const lines = wrapText('가나다', { maxWidth: 1, fontSize: 40 });
    expect(lines).toEqual(['가', '나', '다']);
  });

  it('닫는 문장부호가 줄 맨 앞에 떨어지지 않는다', () => {
    const lines = wrapText('가나다라마바사아자차.', opts);
    expect(lines.some((l) => l.startsWith('.'))).toBe(false);
  });

  it('빈 글은 빈 배열', () => {
    expect(wrapText('', opts)).toEqual([]);
  });

  it('글자 수가 늘면 줄 수도 는다 — 폭 계산이 실제로 동작한다', () => {
    const short = wrapText('가나다', opts).length;
    const long = wrapText('가'.repeat(60), opts).length;
    expect(long).toBeGreaterThan(short);
  });
});

describe('bubbleTextBox', () => {
  it('타원은 사각형보다 좁은 영역을 준다 — 둥근 모서리로 글자가 새지 않게', () => {
    const ellipse = bubbleTextBox('ellipse', 200, 100);
    const rect = bubbleTextBox('rect', 200, 100);
    expect(ellipse.w).toBeLessThan(rect.w);
    expect(ellipse.h).toBeLessThan(rect.h);
  });

  it('영역은 풍선 한가운데에 놓인다', () => {
    const box = bubbleTextBox('ellipse', 200, 100);
    expect(box.x + box.w / 2).toBeCloseTo(100, 5);
    expect(box.y + box.h / 2).toBeCloseTo(50, 5);
  });
});
