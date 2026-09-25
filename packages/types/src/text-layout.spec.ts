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

describe('bubbleTextBox — 모양마다 안쪽이 다르다', () => {
  it('사각 > 타원 > 뾰족 순으로 넓다', () => {
    const rect = bubbleTextBox('rect', 200, 100).w;
    const ellipse = bubbleTextBox('ellipse', 200, 100).w;
    const spike = bubbleTextBox('spike', 200, 100).w;
    expect(rect).toBeGreaterThan(ellipse);
    expect(ellipse).toBeGreaterThan(spike);
  });

  it('뾰족은 가시 안쪽(바깥의 0.7배)에 내접한다 — 0.5배 안쪽', () => {
    // 2026-09-25: 타원과 같은 값을 쓰다가 글자가 가시를 넘어갔다.
    expect(bubbleTextBox('spike', 200, 100).w).toBeLessThanOrEqual(200 * 0.5);
  });

  it('영역은 풍선 한가운데에 놓인다', () => {
    for (const v of ['rect', 'ellipse', 'spike']) {
      const box = bubbleTextBox(v, 200, 100);
      expect(box.x + box.w / 2).toBeCloseTo(100, 5);
      expect(box.y + box.h / 2).toBeCloseTo(50, 5);
    }
  });

  it('다각형은 꼭짓점에서 직접 구한다 — 모양을 모르는 채 추측하지 않는다', () => {
    // 오른쪽으로 치우친 삼각형: 고정 비율이면 중앙에 놓여 왼쪽 빈 공간으로 새어 나간다.
    const tri = [
      { x: 0.5, y: 0 },
      { x: 1, y: 1 },
      { x: 0.5, y: 1 },
    ];
    const box = bubbleTextBox('polygon', 200, 100, tri);
    const fixed = bubbleTextBox('polygon', 200, 100);
    expect(box.x).not.toBeCloseTo(fixed.x, 1);
    // 당긴 다각형의 bbox 이므로 원본 bbox 안에 들어간다.
    expect(box.x).toBeGreaterThanOrEqual(0.5 * 200 - 1);
    expect(box.x + box.w).toBeLessThanOrEqual(200 + 1);
  });

  it('꼭짓점이 모자라면 고정 비율로 떨어진다', () => {
    const two = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(bubbleTextBox('polygon', 200, 100, two)).toEqual(bubbleTextBox('polygon', 200, 100));
  });

  it('모르는 variant 는 타원 값으로 떨어진다', () => {
    expect(bubbleTextBox('무엇', 200, 100)).toEqual(bubbleTextBox('ellipse', 200, 100));
  });
});
